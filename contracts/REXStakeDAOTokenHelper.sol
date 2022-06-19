//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
import "./masterChef/IMasterChef.sol";
import "./REXStakeDAOTokenStorage.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@superfluid-finance/ethereum-contracts/contracts/superfluid/SuperToken.sol";
import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {
    IInstantDistributionAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";

// NOTES:
//  minichef = https://polygonscan.com/address/0x68456b298c230415e2de7ad4897a79ee3f1a965a
// poolid =
//
//

library REXStakeDAOTokenHelper {

    function initializeIDA(REXStakeDAOTokenStorage.sdam3CRVrex storage self) public  {
      // Set up the IDA for sending tokens back
      _createIndex(self, 0, self.sdtx);

      // TODO: Not sure this is needed if there's logic to check
      //       that there's shares in an IDA before distribute
      // Give the owner 1 share just to start up the contract
      // _updateSubscription(self, 0, msg.sender, 1, self.sdtx);

    }

    function upgrade(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint256 amount) public  {
      // Havest and distribute SUSHI rewards if there's any pending
      if (self.miniChef.pendingSdt(self.pid, address(this)) > 0) {
        harvest(self);
      }

      self.miniChef.deposit(self.pid, amount);

      // Update the callers IDA shares
      (bool exist,
       bool approved,
       uint128 units,
       uint256 pendingDistribution) = _getIDAShares(self, 0, self.sdtx, msg.sender);

       // Units scalled down 1.9, scale down amount
       amount = amount / 1e9;
      _updateSubscription(self, 0, msg.sender, units + uint128(amount - amount / 10), self.sdtx);

      // Update the callers IDA shares
      (exist,
       approved,
       units,
       pendingDistribution) = _getIDAShares(self, 0, self.sdtx, self.owner);
      _updateSubscription(self, 0, self.owner, units + uint128(amount / 10), self.sdtx);


    }

    function downgrade(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint256 amount) public  {
      self.miniChef.withdraw(self.pid, amount);
      harvest(self);

      // Distribute rewards IFF there are rewards to distribute
      if (self.sdtx.balanceOf(address(this)) > 0) {
        distribute(self, 0, self.sdtx);
      }
      // Update the callers IDA shares
      (bool exist,
       bool approved,
       uint128 units,
       uint256 pendingDistribution) = _getIDAShares(self, 0, self.sdtx, msg.sender);

       // Units scalled down 1.9, scale down amount
       amount = amount / 1e9;
      _updateSubscription(self, 0, msg.sender, units + uint128(amount / 10000 * 900), self.sdtx);

      // Update the callers IDA shares
      (exist,
       approved,
       units,
       pendingDistribution) = _getIDAShares(self, 0, self.sdtx, self.owner);
      _updateSubscription(self, 0, self.owner, units + uint128(amount / 10000), self.sdtx);

    }

    function distribute(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint32 index, ISuperToken token) public {
      _idaDistribute(self, index, uint128(token.balanceOf(address(this))), token);
    }

    function harvest(REXStakeDAOTokenStorage.sdam3CRVrex storage self) public {

      // Try to harvest from minichef, catch and continue iff there's no sdt in miniChef
      try self.miniChef.withdraw(self.pid, 0) {
      } catch Error(string memory reason) {
        require(keccak256(bytes(reason)) == keccak256(bytes("BoringERC20: Transfer failed")), "!boringERC20Error");
      }

      // Distribute rewards IFF there are rewards to distribute
      uint256 sdts = IERC20(self.sdtx.getUnderlyingToken()).balanceOf(address(this));
      if (sdts > 0) {
        self.sdtx.upgrade(sdts);
      }

      if (self.sdtx.balanceOf(address(this)) > 0) {
        distribute(self, 0, self.sdtx);
      }
    }

    function _createIndex(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint256 index, ISuperToken distToken) internal {
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
        REXStakeDAOTokenStorage.sdam3CRVrex storage self,
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

    function _idaDistribute(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint32 index, uint128 distAmount, ISuperToken distToken) internal {

      (bool exist, uint128 indexValue, uint128 totalUnitsApproved, uint128 totalUnitsPending) = self.ida.getIndex(
                                                                    distToken,
                                                                    address(this),
                                                                    index);
      if(totalUnitsApproved + totalUnitsPending > 0) {
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
    }

    function _getIDAShares(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint32 index, ISuperToken idaToken, address streamer) internal view returns (
                  bool exist,
                  bool approved,
                  uint128 units,
                  uint256 pendingDistribution) {

      (exist, approved, units, pendingDistribution) = self.ida.getSubscription(
                                                                    idaToken,
                                                                    address(this),
                                                                    index,
                                                                    streamer);
    }

    function _getIDAShares(REXStakeDAOTokenStorage.sdam3CRVrex storage self, uint32 index, ISuperToken idaToken) internal view returns (bool exist,
            uint128 indexValue,
            uint128 totalUnitsApproved,
            uint128 totalUnitsPending) {

      (exist,indexValue,totalUnitsApproved,totalUnitsPending) = self.ida.getIndex(
                                                                    idaToken,
                                                                    address(this),
                                                                    index);
    }

}
