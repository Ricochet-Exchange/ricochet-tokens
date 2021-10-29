require('dotenv').config()
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-contract-sizer');
require("@nomiclabs/hardhat-etherscan");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.7.6", // Fetch exact version from solc-bin (default: truffle's version)
    settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
            enabled: true,
            runs: 200,
        },
        // evmVersion: use default
    },
  },
  mocha: {
    timeout: 100000
  },
  networks: {
    polygon: {
      url: "https://polygon-mainnet.infura.io/v3/" + process.env.INFURA_KEY,
      accounts: [process.env.MATIC_PRIVATE_KEY],
      gas: 2000000,
      gasPrice: 50000000000
    },
    hardhat: {
        forking: {
          url: "https://polygon-mainnet.infura.io/v3/" + process.env.INFURA_KEY,
          accounts: [process.env.MATIC_PRIVATE_KEY],
        }
      }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.POLYSCAN_API_KEY
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  }
};
