//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "./masterChef/IMasterChef.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@superfluid-finance/ethereum-contracts/contracts/superfluid/SuperToken.sol";
import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {
    IInstantDistributionAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";



library REXStakeDAOTokenStorage {


  struct sdam3CRVrex {
    IERC20 sdam3CRV;
    ISuperToken sdtx;
    IMasterChef miniChef;
    uint256 pid;
    IInstantDistributionAgreementV1 ida;
    ISuperfluid host;
    address owner;
  }

}
