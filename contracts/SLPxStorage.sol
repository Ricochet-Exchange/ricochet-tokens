//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "./sushiswap/IMiniChefV2.sol";
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



library SLPxStorage {

  struct SLPx {
    IERC20 lpToken;
    ISuperToken maticx;
    ISuperToken sushix;
    IMiniChefV2 miniChef;
    uint256 pid;
    IInstantDistributionAgreementV1 ida;
    ISuperfluid host;
  }

}
