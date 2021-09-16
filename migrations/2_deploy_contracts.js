const SLPxStorage = artifacts.require("SLPxStorage");
const SLPxHelper = artifacts.require("SLPxHelper");
const RicochetToken = artifacts.require("RicochetToken");

const aliceAddress = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
const ownerAddress = "0xEb22B4EF5f66D52a92c8533361b7BE4576C8C3d3";
const lpTokenAddress = "0x34965ba0ac2451A34a0471F04CCa3F990b8dea27";
const maticxAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
const sushixAddress = "0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b";
const miniChefAddress = "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F";
const pid = "1";
const sfHost = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
const sfIDA = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";

module.exports = function(deployer) {
  deployer.deploy(SLPxHelper);
  deployer.deploy(SLPxStorage);
  deployer.link(SLPxHelper, RicochetToken);
  deployer.link(SLPxStorage, RicochetToken);
  let slpx = deployer.deploy(RicochetToken, sfHost);
  await slpx.deployed();

  // Initialize Ricochet SLP
  await slpx.initialize(
          lpTokenAddress,
          18,
          "Ricochet SLP (USDC/ETH)",
          "SLPr");

  await slpx.setSLP(
      sfIDA,
      lpTokenAddress,
      maticxAddress,
      sushixAddress,
      miniChefAddress,
      pid);
};
