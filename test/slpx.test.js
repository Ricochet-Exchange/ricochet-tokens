const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");
const { expect } = require("chai");
const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const traveler = require("ganache-time-traveler");

// Pre-requisites
// - Tests against mainnet polygon using forking using an Alice wallet
// - Alice wallet needs some SLP tokens
// - Alice wallet can't have any SUSHIx, MATICx

const aliceAddress = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
const ownerAddress = "0xEb22B4EF5f66D52a92c8533361b7BE4576C8C3d3";
const lpTokenAddress = "0x34965ba0ac2451A34a0471F04CCa3F990b8dea27";
const maticxAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
const sushixAddress = "0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b";
const miniChefAddress = "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F";
const pid = "1";
const sfHost = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
const sfIDA = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";

describe("SLPx", function () {

  let slpx;
  let slp;
  let alice;
  let owner;
  let minichef;
  let maticx;
  let sushix;

  before(async function() {

    // Make Alice
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [aliceAddress]}
    )
    alice = await ethers.getSigner(aliceAddress)

    // Make Deployer
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ownerAddress]}
    )
    owner = await ethers.getSigner(ownerAddress)


    // Delpoy SLPx
    const SLPxHelper = await ethers.getContractFactory("SLPxHelper");
    let slpxHelper = await SLPxHelper.deploy();

    const SLPx = await ethers.getContractFactory("RicochetToken",{
      signer: alice,
      libraries: {
              SLPxHelper: slpxHelper.address,
      },
    });
    slpx = await SLPx.deploy(sfHost);
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

    await slpx.transferOwnership(owner.address)

    // Attach alice to the SLP token
    const ERC20 = await ethers.getContractFactory("ERC20");
    slp = await ERC20.attach(lpTokenAddress);
    slp = slp.connect(alice)

    // Attach to MiniCheh
    const MiniChef = await ethers.getContractAt("IMiniChefV2", miniChefAddress);
    minichef = await MiniChef.attach(miniChefAddress);
    minichef = minichef.connect(alice)

    // Attach to super tokens
    const MATICx = await ethers.getContractFactory("SuperToken");
    maticx = await MATICx.attach(lpTokenAddress);
    maticx = maticx.connect(alice)

    const SUSHIx = await ethers.getContractFactory("SuperToken");
    sushix = await SUSHIx.attach(lpTokenAddress);
    sushix = sushix.connect(alice)


  });

  it("deployed with correct attributes", async function () {

  });

  it("upgrades SLP tokens", async function () {

    // Alice approves her balance of SLP tokens to be upgraded and upgrades
    let aliceSLPBalance = (await slp.balanceOf(alice.address)).toString()
    await slp.approve(slpx.address, aliceSLPBalance);
    console.log("Upgrading SLP", aliceSLPBalance)
    let tx = await slpx.upgrade(aliceSLPBalance, {from: alice.address});

    // After upgrade expect...
    // Alice has the right amount of SLPx
    expect((await slpx.balanceOf(alice.address)).toString()).to.equal(aliceSLPBalance);
    // SLPx has SLP on deposit at Mini Chef
    let userInfo = await minichef.userInfo(pid, slpx.address);
    expect(userInfo[0].toString()).to.equal(aliceSLPBalance);

  });

  it("harvests SUSHI and MATIC rewards", async function () {

    // SLPx has tokens on deposit with MiniChef, so just wait then call harvest
    await traveler.advanceTimeAndBlock(60*60*24); // Move forward 1 day

    await slpx.harvest();

    // After harvest expect...
    // SLPx has some SUSHIx and MATICx
    expect((await sushix.balanceOf(alice.address)).toString()).to.be.above(0);
    expect((await maticx.balanceOf(alice.address)).toString()).to.be.above(0);

  });

  it("downgrades SLPx tokens", async function () {

    // Alice has SLPx from the previous test
    let aliceSLPxBalance = (await slpx.balanceOf(alice.address)).toString()
    let tx = await slpx.downgrade(aliceSLPxBalance);
    console.log(aliceSLPxBalance)

    // After downgrade expect...
    // Alice has her SLP tokens back
    expect((await slp.balanceOf(alice.address)).toString()).to.equal(aliceSLPxBalance);
    // SLPx has SLP on deposit at Mini Chef
    let userInfo = await minichef.userInfo(pid, slpx.address);
    expect(userInfo.amount).to.equal(0);
    // Alice gets some SUSHIx and MATICx
    expect((await sushix.balanceOf(alice.address)).toString()).to.be.above(0);
    expect((await maticx.balanceOf(alice.address)).toString()).to.be.above(0);

    // Deployer gets some SUSHIx and MATICx
    expect((await sushix.balanceOf(ownerAddress)).toString()).to.be.above(0);
    expect((await maticx.balanceOf(ownerAddress)).toString()).to.be.above(0);

  });

});
