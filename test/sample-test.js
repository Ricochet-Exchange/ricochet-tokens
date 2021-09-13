const { expect } = require("chai");
const { ethers } = require("hardhat");
const traveler = require("ganache-time-traveler");

// Pre-requisites
// - Tests against mainnet polygon using forking using an Alice wallet
// - Alice wallet needs some SLP tokens
// - Alice wallet can't have any SUSHIx, MATICx

const aliceAddress = "";
const deployerAddress = "";
const lpTokenAddress = "";
const maticxAddress = "";
const maticAddress = "";
const sushixAddress = "";
const sushiAddress = "";
const miniChefAddress = "";
const pid = "";

describe("SLPx", function () {

  let slpx;
  let slp;
  let alice;
  let minichef;
  let maticx;
  let sushix;

  before(function() {

    // Make Alice
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [aliceAddress]}
    )
    alice = await ethers.provider.getSigner(aliceAddress)

    // Delpoy SLPx
    const SLPx = await ethers.getContractFactory("SLPx",{
      signer: deployerAddress
    });
    slpx = await SLPx.deploy(
      lpTokenAddress,
      maticxAddress,
      sushixAddress,
      miniChefAddress,
      pid
    );
    await slpx.deployed();

    // Attach alice to the SLP token
    const ERC20 = await ethers.getContractFactory("ERC20");
    slp = await ERC20.attach(lpTokenAddress);
    slp = slp.connect(alice)

    // Attach to MiniCheh
    const MiniChef = await ethers.getContractFactory("MiniChef");
    minichef = await MiniChef.attach(miniChefAddress);
    minichef = minichef.connect(alice)

    // Attach to super tokens
    const SuperToken = await ethers.getContractFactory("SuperToken");
    maticx = await SuperToken.attach(lpTokenAddress);
    maticx = maticx.connect(alice)

    const SuperToken = await ethers.getContractFactory("SuperToken");
    sushix = await SuperToken.attach(lpTokenAddress);
    sushix = sushix.connect(alice)


  });

  it("deployed with correct attributes", async function () {

    expect(await slpx.getLpTokenAddress()).to.equal("Hello, world!");
    expect(await slpx.getMaticxTokenAddress()).to.equal("Hello, world!");
    expect(await slpx.getSushixTokenAddress()).to.equal("Hello, world!");
    expect(await slpx.getMiniChefAddress()).to.equal("Hello, world!");
    expect(await slpx.getPid()).to.equal("Hello, world!");

  });

  it("upgrades SLP tokens", async function () {

    // Alice approves her balance of SLP tokens to be upgraded and upgrades
    let aliceSLPBalance = await slp.balanceOf(alice.address)).toString()
    await slp.approve(slpx.address, aliceSLPBalance);
    let tx = await slpx.upgrade(aliceSLPBalance);

    // After upgrade expect...
    // Alice has the right amount of SLPx
    expect((await slpx.balanceOf(alice.address)).toString()).to.equal(aliceSLPBalance);
    // SLPx has SLP on deposit at Mini Chef
    let userInfo = await minichef.userInfo(pid, slpx.address);
    expect(userInfo.amount).to.equal(aliceSLPBalance);

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
    let aliceSLPxBalance = await slpx.balanceOf(alice.address)).toString()
    let tx = await slpx.downgrade(aliceSLPBalance);

    // After downgrade expect...
    // Alice has her SLP tokens back
    expect((await slp.balanceOf(alice.address)).toString()).to.equal(aliceSLPBalance);
    // SLPx has SLP on deposit at Mini Chef
    let userInfo = await minichef.userInfo(pid, slpx.address);
    expect(userInfo.amount).to.equal(0);
    // Alice gets some SUSHIx and MATICx
    expect((await sushix.balanceOf(alice.address)).toString()).to.be.above(0);
    expect((await maticx.balanceOf(alice.address)).toString()).to.be.above(0);

    // Deployer gets some SUSHIx and MATICx
    expect((await sushix.balanceOf(deployerAddress)).toString()).to.be.above(0);
    expect((await maticx.balanceOf(deployerAddress)).toString()).to.be.above(0);

  });

});
