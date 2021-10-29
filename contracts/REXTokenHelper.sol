//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
import "./sushiswap/IMiniChefV2.sol";
import "./matic/IWMATIC.sol";
import "./superfluid/IMATICx.sol";
import "./REXTokenStorage.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@superfluid-finance/ethereum-contracts/contracts/superfluid/SuperToken.sol";
import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {
    IInstantDistributionAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";



library REXTokenHelper {

    function setSLP(
      REXTokenStorage.SLPx storage self,
      IInstantDistributionAgreementV1 ida,
      IERC20 lpTokenAddress,
      ISuperToken maticxAddress,
      ISuperToken sushixAddress,
      IMiniChefV2 miniChefAddress,
      uint256 pid) public {
              self.ida = ida;
      self.lpToken = lpTokenAddress;
      self.maticx = maticxAddress;
      self.sushix = sushixAddress;
      self.miniChef = miniChefAddress;
      self.pid = pid;

      // Unlimited approve MiniChef to transfer SLP tokens
      self.lpToken.approve(address(self.miniChef), 2**256 - 1);
      IERC20(self.sushix.getUnderlyingToken()).approve(address(self.sushix), 2**256 - 1);
      IERC20(self.maticx.getUnderlyingToken()).approve(address(self.maticx), 2**256 - 1);

      _initializeIDA(self);
    }

    function _initializeIDA(REXTokenStorage.SLPx storage self) internal  {
      // Set up the IDA for sending tokens back
      _createIndex(self, 0, self.sushix);
      _createIndex(self, 1, self.maticx);

      // TODO: Not sure this is needed if there's logic to check
      //       that there's shares in an IDA before distribute
      // Give the owner 1 share just to start up the contract
      _updateSubscription(self, 0, msg.sender, 1, self.sushix);
      _updateSubscription(self, 1, msg.sender, 1, self.maticx);

    }

    function upgrade(REXTokenStorage.SLPx storage self, uint256 amount, bytes memory ctx)
      external returns (bytes memory newCtx)  {

      newCtx = ctx;

      // Havest and distribute SUSHI rewards if there's any pending
      if (self.miniChef.pendingSushi(self.pid, address(this)) > 0) {
        harvest(self);
      }

      self.miniChef.deposit(self.pid, amount, address(this));
      console.log("To Upgrade", amount);
      if (newCtx.length == 0) {
        _updateSubscription(self, 0, msg.sender, uint128(amount), self.sushix);
        _updateSubscription(self, 1, msg.sender, uint128(amount), self.maticx);
      } else {
        newCtx = _updateSubscriptionWithContext(self, newCtx, 0, msg.sender, uint128(amount), self.sushix);
        newCtx = _updateSubscriptionWithContext(self, newCtx, 1, msg.sender, uint128(amount), self.maticx);
      }
      // TODO: this is repeated code found in downgrade
      // Update the owners IDA shares
      uint128 totalUnitsApproved;
      uint128 totalUnitsPending;
      (,,totalUnitsApproved,totalUnitsPending) = _getIDAShares(self, 0, self.sushix);
      console.log("totalUnitsApproved", totalUnitsApproved);
      console.log("totalUnitsPending",totalUnitsPending);
      totalUnitsApproved = uint128(1000000) * (totalUnitsApproved + totalUnitsPending) / uint128(800000) - (totalUnitsApproved + totalUnitsPending);

      if (newCtx.length == 0) {
        _updateSubscription(self, 0, self.owner, totalUnitsApproved, self.sushix);
        _updateSubscription(self, 1, self.owner, totalUnitsApproved, self.maticx);
      } else {
        newCtx = _updateSubscriptionWithContext(self, newCtx, 0, self.owner, totalUnitsApproved, self.sushix);
        newCtx = _updateSubscriptionWithContext(self, newCtx, 1, self.owner, totalUnitsApproved, self.maticx);
      }
    }

    function downgrade(REXTokenStorage.SLPx storage self, address account, uint256 amount, bytes memory ctx)
      public returns(bytes memory newCtx)
    {
      newCtx = ctx;

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
       uint256 pendingDistribution) = _getIDAShares(self, 0, self.sushix, account);
       console.log("uint128 amount", uint128(amount));
       console.log("uint128 amount", units);
      if (newCtx.length == 0) {
        _updateSubscription(self, 0, account, units - uint128(amount), self.sushix);
      } else {
        newCtx = _updateSubscriptionWithContext(self, newCtx, 0, account, units - uint128(amount), self.sushix);
      }

      (exist,
       approved,
       units,
       pendingDistribution) = _getIDAShares(self, 1, self.maticx, account);
       if (newCtx.length == 0) {
         _updateSubscription(self, 0, account, units - uint128(amount), self.maticx);
       } else {
         newCtx = _updateSubscriptionWithContext(self, newCtx, 0, account, units - uint128(amount), self.maticx);
       }


      // TODO: Don't repeat this in harvest and upgrade()
      // Update the owners IDA shares
      uint128 pendingShares;
      (,,units,pendingShares) = _getIDAShares(self, 0, self.sushix);
      units = uint128(1000000) * (units + pendingShares) / uint128(800000) - (units + pendingShares);
      if (newCtx.length == 0) {
        _updateSubscription(self, 0, self.owner, units, self.sushix);
        _updateSubscription(self, 1, self.owner, units, self.maticx);
      } else {
        newCtx = _updateSubscriptionWithContext(self, newCtx, 0, self.owner, units, self.sushix);
        newCtx = _updateSubscriptionWithContext(self, newCtx, 1, self.owner, units, self.maticx);
      }


    }

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

    function _createIndex(REXTokenStorage.SLPx storage self, uint256 index, ISuperToken distToken) internal {
      self.host.callAgreement(
         self.ida,
         abi.encodeWithSelector(
             self.ida.createIndex.selector,
             distToken,
             index,
             new bytes(0) // placeholder ctx
         ),
         new bytes(0) // user data
       );
    }

    function _updateSubscription(
        REXTokenStorage.SLPx storage self,
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken) internal {
      self.host.callAgreement(
         self.ida,
         abi.encodeWithSelector(
             self.ida.updateSubscription.selector,
             distToken,
             index,
             // one share for the to get it started
             subscriber,
             shares,
             new bytes(0) // placeholder ctx
         ),
         new bytes(0) // user data
     );
    }

    function _updateSubscriptionWithContext(
        REXTokenStorage.SLPx storage self,
        bytes memory ctx,
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken)
        internal returns (bytes memory newCtx)  {

        newCtx = ctx;
        (newCtx, ) = self.host.callAgreementWithContext(
          self.ida,
          abi.encodeWithSelector(
              self.ida.updateSubscription.selector,
              distToken,
              index,
              subscriber,
              shares / 1e9,  // Number of shares is proportional to their rate
              new bytes(0)
          ),
          new bytes(0), // user data
          newCtx
        );
    }

    function _idaDistribute(REXTokenStorage.SLPx storage self, uint32 index, uint128 distAmount, ISuperToken distToken) internal {
      self.host.callAgreement(
        self.ida,
        abi.encodeWithSelector(
            self.ida.distribute.selector,
            distToken,
            index,
            distAmount,
            new bytes(0) // placeholder ctx
        ),
        new bytes(0) // user data
      );
    }

    function _getIDAShares(REXTokenStorage.SLPx storage self, uint32 index, ISuperToken idaToken, address streamer) internal view returns (bool exist,
                  bool approved,
                  uint128 units,
                  uint256 pendingDistribution) {

      (exist, approved, units, pendingDistribution) = self.ida.getSubscription(
                                                                    idaToken,
                                                                    address(this),
                                                                    index,
                                                                    streamer);
    }

    function _getIDAShares(REXTokenStorage.SLPx storage self, uint32 index, ISuperToken idaToken) internal view returns (bool exist,
            uint128 indexValue,
            uint128 totalUnitsApproved,
            uint128 totalUnitsPending) {

      (exist,indexValue,totalUnitsApproved,totalUnitsPending) = self.ida.getIndex(
                                                                    idaToken,
                                                                    address(this),
                                                                    index);
    }

}
