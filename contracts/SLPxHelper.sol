//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
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

    function downgrade(SLPxStorage.SLPx storage self, uint256 amount) public  {
      self.miniChef.withdrawAndHarvest(self.pid, amount, address(this));

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

    function distribute(SLPxStorage.SLPx storage self, uint32 index, ISuperToken token) public {
      _idaDistribute(self, index, uint128(token.balanceOf(address(this))), token);
    }

    function harvest(SLPxStorage.SLPx storage self) public {
      self.miniChef.harvest(self.pid, address(this));

      // Distribute rewards IFF there are rewards to distribute
      uint256 sushis = IERC20(self.sushix.getUnderlyingToken()).balanceOf(address(this));
      uint256 matics = address(this).balance;
      if (sushis > 0) {
        self.sushix.upgrade(sushis);
      }
      if (matics > 0) {
        self.maticx.upgrade(matics);
      }

      // Distribute rewards IFF there are rewards to distribute
      if (self.sushix.balanceOf(address(this)) > 0) {
        distribute(self, 0, self.sushix);
      }
      if (self.maticx.balanceOf(address(this)) > 0) {
        distribute(self, 1, self.maticx);
      }
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
             shares,
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

    function _getIDAShares(SLPxStorage.SLPx storage self, uint32 index, ISuperToken idaToken) internal view returns (bool exist,
            uint128 indexValue,
            uint128 totalUnitsApproved,
            uint128 totalUnitsPending) {

      (exist,indexValue,totalUnitsApproved,totalUnitsPending) = self.ida.getIndex(
                                                                    idaToken,
                                                                    address(this),
                                                                    index);
    }

}
