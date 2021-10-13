const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");

const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const ownerAddress = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
const sushixAddress = "0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b";
const maticxAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
const slpxAddress = "0x5aDE3b37Fa086f96B6281c0df80F5AD3ec0113f4";
async function main() {

  sf = new SuperfluidSDK.Framework({
      web3,
      resolverAddress: "0xE0cc76334405EE8b39213E620587d815967af39C",
      tokens: ["WBTC", "DAI", "USDC", "ETH"],
      version: "v1"
  });
  await sf.initialize();

  // await web3tx(
  //     sf.host.callAgreement,
  //     ownerAddress + " approves subscription to the app " + sushixAddress
  // )(
  //     sf.agreements.ida.address,
  //     sf.agreements.ida.contract.methods
  //         .approveSubscription(sushixAddress, slpxAddress, 0, "0x")
  //         .encodeABI(),
  //     "0x", // user data
  //     {
  //         from: ownerAddress
  //     }
  // );

  await web3tx(
      sf.host.callAgreement,
      ownerAddress + " approves subscription to the app " + maticxAddress
  )(
      sf.agreements.ida.address,
      sf.agreements.ida.contract.methods
          .approveSubscription(maticxAddress, slpxAddress, 1, "0x")
          .encodeABI(),
      "0x", // user data
      {
          from: ownerAddress
      }
  );

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
