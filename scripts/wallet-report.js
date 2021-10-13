const hre = require("hardhat");
const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");

const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const ownerAddress = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
const sushixAddress = "0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b";
const maticxAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
const slpxAddress = "0x5aDE3b37Fa086f96B6281c0df80F5AD3ec0113f4";
async function main() {


    const SUSHIx = await hre.ethers.getContractFactory("SuperToken");
    sushix = await SUSHIx.attach(sushixAddress);
    const MATICx = await hre.ethers.getContractFactory("SuperToken");
    maticx = await MATICx.attach(sushixAddress);

    console.log("SUSHIx Balance:", (await sushix.balanceOf(ownerAddress)).toString());
    console.log("MATICx Balance:", (await maticx.balanceOf(ownerAddress)).toString());


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
