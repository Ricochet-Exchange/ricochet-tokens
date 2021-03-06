# Ricochet Auto-Farming Tokens
This document details modifications made to SuperTokens to enable _auto-farming_, a practice where reward tokens are automatically harvested/claimed and distributed to holders. The document describes the current state of "Ricochet Tokens" using `SLPx` as an example. The document includes an enhancement that needs to be implemented so that Ricochet Tokens can be their own standalone product as well as something that can be streamed into (e.g. USDC>>SLPx).

# Table of Contents
1. [Background](#background)
2. [Features](#features)
3. [Contract Architecture](#contract-architecture)
4. [Modifications](#modifications)
    1. [Ownable and Lockable](#ownable-and-lockable)
    2. [SuperToken Modifications](#superToken-modifications)
    3. [REX Market Modifications](#rex-market-modifications)
5. [Limitations](#limitations)
6. [Enhancements](#enhancements)

## Background
There are opprotunities to earn rewards on certain tokens. For example:
* Sushi LP tokens can be deposited in Sushi Farms to earn MATIC and SUSHI
* am3CRV tokens can be deposted into StakeDAO to earn SDT rewards
Ricochet Tokens enable the holder to receive the reward tokens (e.g. SDT) automatically using Superfluid's _InstantDistributionAgreement_.

## Features
* Ricochet Tokens allow the holder to receive the reward tokens without paying for gas to claim
* Distributions are triggered by Ricochet's Keepers and take play periodically
* Token holders can unwrap their token to receive the underlying token anytime

## Contract Architecture
![alt text](../images/architecture.png)

# Modifications
This section shows the modifications made to the underlying `SuperfluidToken` and `SuperToken` contracts that make REX Auto-Farming Tokens possible. These tokens are called `RicochetToken` and `REXToken` respectively.

## Ownable and Lockable
Ricochet Tokens are Ownable. In the SLPx Ricochet Token, the owner of the token is the REXMarket where users can DCA into SLPx. Ricochet Tokens also implement a _lock_ that disables features of the token. This lock is required to address some of the limitation of the auto-farming features. The lock is toggled only by the owner:
```
function lock(bool _lockIt) public onlyOwner {
isLocked = _lockIt;
}
```
Creating Agreements is disabled while locked, this prevents anyone other than the owner from streaming or IDA distributing. These features are only allowed by the owner because its to difficult to update the internal rewards IDA shares if everyone is allowed to stream and IDA distribute tokens. In fact, CFA streams are not supported on these tokens, they can only be IDA distributed. Streaming these LP tokens is not a feature that's needed.
```
/// @dev ISuperfluidToken.createAgreement implementation
/// @dev Lock added to prevent anyone other than the owner from CFA/IDA ops
function createAgreement(
    bytes32 id,
    bytes32[] calldata data
)
    external override
{

    require(isLocked == false, "!unlocked"); // Must be unlocked by the owner before agreements can happen
    // ...
}
```
The `updateAgreementData` method also is locked in the same way.

## SuperToken Modifications
In addition to modifying `SuperfluidToken` there are also modifications to `SuperToken`. The `REXToken` implements the logic that manages distributing the token and depositing/withdrawing tokens from rewards pools (e.g. Sushi Farms).

### Underlying Token
The REXToken uses `REXTokenStorage` and `REXTokenHelper`, these libaries get modified for each implementation of a REXToken (e.g. `REXStakeDAOTokenHelper`, `REXSushiFarmsTokenHelper`). For example, with SLPx auto-farming token:
```
using REXTokenStorage for REXTokenStorage.SLPx;
using REXTokenHelper for REXTokenStorage.SLPx;

REXTokenStorage.SLPx internal slpx;
```
In this example, `slpx` is the object that contains the logic for managing farming the rewards and the upgrading and downgrading hooks that deposit/withdraw from Sushi Farms.

### Underlying Token Setup
Since there's some setup for the underlying token, and since there's usually several underlying tokens (e.g. sdam3CRV and sdamETH share the same interface) there's an initialize. For the SLPx example, where theyre are several LP tokens that are farmable (e.g. MATIC-DAI SLP, ETH-DAI SLP share the same interface):
```
function setSLP(
IInstantDistributionAgreementV1 ida,
IERC20 lpTokenAddress,
ISuperToken maticxAddress,
ISuperToken sushixAddress,
IMiniChefV2 miniChefAddress,
uint256 pid
)
 external
{
 // TODO:
 slpx.host = _host;
 slpx.ida = ida;
 slpx.lpToken = lpTokenAddress;
 slpx.maticx = maticxAddress;
 slpx.sushix = sushixAddress;
 slpx.miniChef = miniChefAddress;
 slpx.pid = pid;
 slpx.owner = owner();
 // Unlimited approve MiniChef to transfer SLP tokens
 slpx.lpToken.approve(address(slpx.miniChef), 2**256 - 1);
 IERC20(slpx.sushix.getUnderlyingToken()).approve(address(slpx.sushix), 2**256 - 1);
 IERC20(slpx.maticx.getUnderlyingToken()).approve(address(slpx.maticx), 2**256 - 1);
 slpx.initializeIDA();
}
```
The `host` and `ida` are associated with `slpx` since the `slpx` object contains the `harvest()` method that harvests rewards from SushiFarms and distributes them to token holders. The rest of the method is just setup to be able to deposit/withdraw tokens from the farm and claim rewards.

### Harvest Method
This method exists in the `REXTokenHelper` libaries and is callable on the token:
```
// In REXToken.sol

/// @dev ISuperToken.upgrade implementation
function harvest() external {
slpx.harvest();
}
```
The `harvest` method contains the logi around claiming and distributing rewards. There is also a `distribute` method that does the distribution using an IDA pool.
```
// In REXTokenHelper.sol

function distribute(REXTokenStorage.SLPx storage self, uint32 index, ISuperToken token) public {
  _idaDistribute(self, index, uint128(token.balanceOf(address(this))), token);
}

function harvest(REXTokenStorage.SLPx storage self) public {

  // Try to harvest from minichef, catch and continue iff there's no sushi
  try self.miniChef.harvest(self.pid, address(this)) {
  } catch Error(string memory reason) {
    require(keccak256(bytes(reason)) == keccak256(bytes("BoringERC20: Transfer failed")), "!boringERC20Error");
  }

  // Distribute rewards IFF there are rewards to distribute
  uint256 sushis = IERC20(self.sushix.getUnderlyingToken()).balanceOf(address(this));
  uint256 matics = IERC20(self.maticx.getUnderlyingToken()).balanceOf(address(this));
  IWMATIC(self.maticx.getUnderlyingToken()).withdraw(matics);
  if (sushis > 0) {
    self.sushix.upgrade(sushis);
  }
  if (matics > 0) {
    IMATICx(address(self.maticx)).upgradeByETH{value: matics}();
  }

  // Distribute rewards IFF there are rewards to distribute
  if (self.sushix.balanceOf(address(this)) > 0) {
    distribute(self, 0, self.sushix);
  }
  if (self.maticx.balanceOf(address(this)) > 0) {
    distribute(self, 1, self.maticx);
  }
}
```
### Upgrade/Downgrade Modifications
The upgrade and downgrade method use the same logic as typical `SuperToken` and include some extra logic which is called before or after the up/downgrade:
```
// In REXToken.sol

  /// @dev ISuperToken.upgrade implementation
  function upgrade(uint256 amount) external override {
      _upgrade(msg.sender, msg.sender, msg.sender, amount, "", "");
      slpx.upgrade(amount);
  }
  /// @dev ISuperToken.upgradeTo implementation
  function upgradeTo(address to, uint256 amount, bytes calldata data) external override {
      _upgrade(msg.sender, msg.sender, to, amount, "", data);
      slpx.upgrade(amount);
  }
  /// @dev ISuperToken.downgrade implementation
  function downgrade(uint256 amount) external override {
      slpx.downgrade(amount);
      _downgrade(msg.sender, msg.sender, amount, "", "");
  }
```
The `REXTokenHelper` `upgrade` method happens AFTER the internal `_upgrade` is called. The `downgrade` method happens BEFORE the internal `_downgrade` is called.

Inside the `REXTokenHelper` the upgrade and downgrade methods manage the deposit/withdraw and claim for the underlying staked LP tokens, example for SLPx shown below:
```
function upgrade(REXTokenStorage.SLPx storage self, uint256 amount) public  {
  // Havest and distribute SUSHI rewards if there's any pending
  if (self.miniChef.pendingSushi(self.pid, address(this)) > 0) {
    harvest(self);
  }

  self.miniChef.deposit(self.pid, amount, address(this));
  _updateSubscription(self, 0, msg.sender, uint128(amount), self.sushix);
  _updateSubscription(self, 1, msg.sender, uint128(amount), self.maticx);

  // TODO: this is repeated code found in downgrade
  // Update the owners IDA shares
  uint128 totalUnitsApproved;
  uint128 totalUnitsPending;
  (,,totalUnitsApproved,totalUnitsPending) = _getIDAShares(self, 0, self.sushix);
  totalUnitsApproved = uint128(1000000) * (totalUnitsApproved + totalUnitsPending) / uint128(800000) - (totalUnitsApproved + totalUnitsPending);
  _updateSubscription(self, 0, self.owner, totalUnitsApproved, self.sushix);
  _updateSubscription(self, 1, self.owner, totalUnitsApproved, self.maticx);
}

function downgrade(REXTokenStorage.SLPx storage self, uint256 amount) public  {
  self.miniChef.withdraw(self.pid, amount, address(this));
  harvest(self);

  // Distribute rewards IFF there are rewards to distribute
  if (self.sushix.balanceOf(address(this)) > 0) {
    distribute(self, 0, self.sushix);
  }
  if (self.maticx.balanceOf(address(this)) > 0) {
    distribute(self, 1, self.maticx);
  }

  // Update the callers IDA shares
  (bool exist,
   bool approved,
   uint128 units,
   uint256 pendingDistribution) = _getIDAShares(self, 0, self.sushix, msg.sender);
  _updateSubscription(self, 0, msg.sender, units - uint128(amount), self.sushix);

  (exist,
   approved,
   units,
   pendingDistribution) = _getIDAShares(self, 1, self.maticx, msg.sender);
  _updateSubscription(self, 1, msg.sender, units - uint128(amount), self.maticx);


  // TODO: Don't repeat this in harvest and upgrade()
  // Update the owners IDA shares
  uint128 pendingShares;
  (,,units,pendingShares) = _getIDAShares(self, 0, self.sushix);
  units = uint128(1000000) * (units + pendingShares) / uint128(800000) - (units + pendingShares);
  _updateSubscription(self, 0, self.owner, units, self.sushix);
  _updateSubscription(self, 1, self.owner, units, self.maticx);
}
```

## REX Market Modifications
This section explains how the REX Markets are modified to support REX auto-farming tokens:

### Initialize a REX Token in the constructor
In this example, the Ricochet Token is created by passing in the `_slpAddress` for the underlying yield bearing token.
```
constructor(
    address _owner,
    address _slpAddress,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey
  ) public REXMarket(_owner, _host, _cfa, _ida, _registrationKey) {

    RicochetToken _rexToken = new RicochetToken(_host);
    _rexToken.initialize(ERC20(_slpAddress), 18, "Ricochet SLP", "rexSLP");
    rexToken = _rexToken;
    router = IUniswapV2Router02(sushiRouter);

```

###  Initilize Output Token IDA Pools
The SLP tokens staked in Sushi Farms earns a yield in MATICx and SUSHIx. There are pools created for the three output tokens: SLPx, MATICx, SUSHIx. Streamers to the market get an allocation in each. The fee set for the MATICx and SUSHIx are set to 20% where are the SLPx token takes the standard 2% fee.
```
function initializeMarket(
  ISuperToken _inputToken,
  uint256 _rateTolerance,
  ITellor _tellor,
  uint256 _inputTokenRequestId
) public override onlyOwner {

  // Initialize the base REX Market contract
  REXMarket.initializeMarket(_inputToken,_rateTolerance,_tellor,_inputTokenRequestId);

  // Add output pools for outputs:
  // - SLPx
  addOutputPool(ISuperToken(address(rexToken)), 20000, 0, 77);
  // - SUSHIx rewards from Sushi Farm
  addOutputPool(sushix, 200000, 0, 78);
  // - MATICx rewards from Sushi Farm
  addOutputPool(maticx, 200000, 0, 6);
}
```

### Sushi Farm Setup
The setup to be able to deposit/withdraw from Sushi Farms is done in a seperate method:
```
function initializeSushiFarmMarket(
    address _pairToken,
    uint256 _pairTokenRequestId,   // Tellor request ID for SLP value
    uint256 _poolId                // Sushi Farm pool ID for the _pairToken
  ) public onlyOwner {

    require(pairToken == address(0), "Already initialized");
    poolId = _poolId;
    pairToken = _pairToken;

    OracleInfo memory newOracle = OracleInfo(_pairTokenRequestId, 0, 0);
    market.oracles[ISuperToken(pairToken)] = newOracle;
    updateTokenPrice(ISuperToken(pairToken));

    // Approvals
    ERC20(pairToken).safeIncreaseAllowance(address(router), 2**256 - 1);
    ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(address(router), 2**256 - 1);
    ERC20(rexToken.getUnderlyingToken()).safeIncreaseAllowance(address(masterChef), 2**256 - 1);
    ERC20(rexToken.getUnderlyingToken()).safeIncreaseAllowance(address(rexToken), 2**256 - 1);
    ERC20(sushix.getUnderlyingToken()).safeIncreaseAllowance(address(sushix), 2**256 - 1);
    ERC20(maticx.getUnderlyingToken()).safeIncreaseAllowance(address(maticx), 2**256 - 1);

  }
  ```

### Swap and Deposit Method
The swap method becomes `_swapAndDeposit` and the SLP token is made using the input token, then deposited into SushiFarm, and then SLPx is minted.
```
  function _swapAndDeposit(
    uint256 amount,  
    uint256 deadline
  ) public returns(uint) {

    // Downgrade all the input supertokens
    // ...
    // Swap half of input tokens to pair tokens
    // ...
    // Adds liquidity for inputToken/pairToken
    // ...

    // Deposit the SLP tokens made into SushiFarms
    ERC20(rexToken.getUnderlyingToken())
      .approve(
          address(masterChef),
          rexToken.getUnderlyingToken().balanceOf(address(this))
      );

    masterChef.deposit(poolId, slpBalance, address(this));

    // Mint new rexTokens (this contract is the owner of rexToken and can mint)
    rexToken.mintTo(address(this), slpBalance, new bytes(0));

    }

  }
```


# Limitations
The SLPx token was designed to only exist while a stream is open to a REXMarket where the token could be bought. This is due to a limitation in managing the IDA shares. Currently, the IDA shares all belong to the owner and they are forwarded from the SLPx contract to the REXMarket contract and then the REXMarket contract manages IDA pools to distribute these tokens out to the streamers. **Ricochet Auto-farming Tokens are ephemeral** they are minted when someone is streaming to the REXMarket and are burned when the stream is closed.
```
// added to agreement termination callbacks
if (isTerminating) {

  // Burn the requesters SLPx balance and return SLP tokens
  balance = _exchange.outputToken.balanceOf(requester);
  IRicochetToken(address(_exchange.outputToken)).burnFrom(requester, balance, new bytes(0));

  // Withdraw from MiniChef to requester
  _exchange.miniChef.withdraw(_exchange.pid, balance, requester);
}
```

When stream is closed, the REXToken (SLPx) gets downgraded and after the closed stream, the streamer will hold the underlying token unstaked from any rewards pools (e.g. when you stop streaming to the USDC>>SLPx pool, you are left with SLP tokens, the ERC20 LP token).

```
newCtx = _exchange._updateSubscriptionWithContext(newCtx, _exchange.outputIndexId, requester, uint128(uint(int(requesterFlowRate))), _exchange.outputToken);
newCtx = _exchange._updateSubscriptionWithContext(newCtx, _exchange.sushixIndexId, requester, uint128(uint(int(requesterFlowRate))), _exchange.sushixToken);
newCtx = _exchange._updateSubscriptionWithContext(newCtx, _exchange.maticxIndexId, requester, uint128(uint(int(requesterFlowRate))), _exchange.maticxToken);
newCtx = _exchange._updateSubscriptionWithContext(newCtx, _exchange.subsidyIndexId, requester, uint128(uint(int(requesterFlowRate))), _exchange.subsidyToken);
```
A series of subscriptions are updated to distribute the SLPx, SUSHIx, MATICx, and subsidy tokens when the flow rate of a requester changes.

The source of this limitation is the inability to update IDA shares based on how much is IDA distibuted. As a streamers balance accures due to the IDA distributions, they get more and more shares in the REXToken IDA pool. But, its not possible to update the IDA shares of the underlying pool (or the complexity of doing so is to high as to make it impossible). As a user streams more and more into the SLPx REXMarket, they accumulate more and more shares in the REXToken IDA pool. As a result, the REXMarket acts as a proxy for the IDA shares.

:star: It is possible to take SLP tokens and upgrade them to SLPx tokens outside of the REXMarket. Its just a problem when you're receiving SLPx tokens via IDA distributions. As you receive more SLPx tokens via the IDA of the REXMarket, its not possible to update your IDA shares in the underlying SLPx token since this would require one `updateSubscription` call for each streamer.  

# Enhancements
Currently, REX Tokens can stand alone, they would NOT support IDA or CFA streaming but would still support upgrade/downgrade so holding them you would get the benefits of auto-farming. IDA shares on the REX token are simple to manage when you're upgrading, downgrading, or ERC20 transfering tokens, since these are individual operations by an individual account, so its as simple as calling `updateSubscription` in each of those methods.

While receiving the tokens via and IDA distribution, which is the case in the USDC>>SLPx market the REXMarket itself must be _delegated_ the streamers IDA shares in the underlying REXToken and then it will get forwarded to the streamer using IDA pools on the REXMarket. There must be an added requirement that isn't currently implemented for the REXToken to work as both a standalone product as well as something you can stream into:

:star: If a streamer already holds REXTokens, then the existing IDA shares they have need to be transfered to the REX Market. When the streamer stops streaming, the IDA shares need to be transfered back to the holder.

This is a change from the current implementation where SLPx tokens can only be created by the REXMarket contract that owns them. When a stream starts, the REXMarket is the one getting credited IDA shares. And the REXMarket then forwards the rewards, managing its own IDA share pool for the rewards tokens as well as the underlying LP tokens. When streaming stops, the tokens in the holders possession are downgraded, their shares removed. _Upgrade and downgrade by non-owners of the SLPx token are not supported_. This is handled but the internal lock mechanism (see the _Ownable and Lockable_ section of this doc for more details.)

The new implementation will NOT downgrade tokens and instead, on stream close the shares will be transfered from the REXMarket to the streamer. Adding this single feature will allow both holding and streaming into these Ricochet auto-farming tokens.
