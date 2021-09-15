//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "./sushiswap/IMiniChefV2.sol";
import "./SLPxStorage.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@superfluid-finance/ethereum-contracts/contracts/superfluid/SuperToken.sol";
import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {
    IInstantDistributionAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";



library SLPxHelper {

    function initializeIDA(SLPxStorage.SLPx storage self) public  {
      // Set up the IDA for sending tokens back
      _createIndex(self, 0, self.sushix);
      _createIndex(self, 1, self.maticx);

      // TODO: Not sure this is needed if there's logic to check
      //       that there's shares in an IDA before distribute
      // Give the owner 1 share just to start up the contract
      _updateSubscription(self, 0, msg.sender, 1, self.sushix);
      _updateSubscription(self, 1, msg.sender, 1, self.maticx);

    }

    function upgrade(SLPxStorage.SLPx storage self, uint256 amount) public  {
      self.miniChef.deposit(self.pid, amount, address(this));
      _updateSubscription(self, 0, msg.sender, uint128(amount), self.sushix);
      _updateSubscription(self, 1, msg.sender, uint128(amount), self.maticx);
    }

    function downgrade(SLPxStorage.SLPx storage self, uint256 amount) public  {
      self.miniChef.withdrawAndHarvest(self.pid, amount, address(this));

      // Distribute rewards IFF there are rewards to distribute
      if (self.sushix.balanceOf(address(this)) > 0) {
        distribute(self, 0, self.sushix);
      }
      if (self.maticx.balanceOf(address(this)) > 0) {
        distribute(self, 1, self.maticx);
      }

      // Get the senders current IDA shares
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

    }

    function distribute(SLPxStorage.SLPx storage self, uint32 index, ISuperToken token) public {
      _idaDistribute(self, index, uint128(token.balanceOf(address(this))), token);
    }

    function harvest(SLPxStorage.SLPx storage self) public {
      self.miniChef.harvest(self.pid, address(this));
    }

    function _createIndex(SLPxStorage.SLPx storage self, uint256 index, ISuperToken distToken) internal {
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
        SLPxStorage.SLPx storage self,
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
             shares / 1e9,
             new bytes(0) // placeholder ctx
         ),
         new bytes(0) // user data
     );
    }

    function _idaDistribute(SLPxStorage.SLPx storage self, uint32 index, uint128 distAmount, ISuperToken distToken) internal {
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

    function _getIDAShares(SLPxStorage.SLPx storage self, uint32 index, ISuperToken idaToken, address streamer) internal view returns (bool exist,
                  bool approved,
                  uint128 units,
                  uint256 pendingDistribution) {

      (exist, approved, units, pendingDistribution) = self.ida.getSubscription(
                                                                    idaToken,
                                                                    address(this),
                                                                    index,
                                                                    streamer);
    }

}
