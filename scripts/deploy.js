const hre = require("hardhat");


async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());


  const lpTokenAddress = "0x34965ba0ac2451A34a0471F04CCa3F990b8dea27";
  const maticxAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
  const sushixAddress = "0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b";
  const miniChefAddress = "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F";
  const pid = "1";
  const sfHost = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const sfIDA = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";
  // Delpoy SLPx
  const REXTokenHelper = await hre.ethers.getContractFactory("REXTokenHelper");
  let rexTokenHelper = await REXTokenHelper.deploy();

  const REXToken = await hre.ethers.getContractFactory("REXToken",{
    libraries: {
            REXTokenHelper: rexTokenHelper.address,
    },
  });
  rexToken = await REXToken.deploy(sfHost);
  await rexToken.deployed();

  // Initialize Ricochet SLP
  await rexToken.initialize(
          lpTokenAddress,
          18,
          "Ricochet SLP (USDC/ETH)",
          "rexSLP");

  await rexToken.setSLP(
      sfIDA,
      lpTokenAddress,
      maticxAddress,
      sushixAddress,
      miniChefAddress,
      pid);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
