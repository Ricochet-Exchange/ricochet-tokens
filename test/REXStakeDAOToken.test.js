const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");
const { expect } = require("chai");
const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const traveler = require("ganache-time-traveler");

// Pre-requisites
// - Tests against mainnet polygon using forking using an Alice wallet
// - Alice wallet needs some sdam3CRVrex
// - Alice wallet should not have any SDTx

// Ricochet deployer wallet
const aliceAddress = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
// Owner address
const ownerAddress = "0x1A50a6238eb67285cCD4DF17f75CCe430BAAE2A4";
// StakeDAO sdam3CRV contract
const lpTokenAddress = "0x7d60F21072b585351dFd5E8b17109458D97ec120";
// Super StakeDAO token
const sdtxAddress = "0xD7EAfCd150391e0b1DdCA1CB8ab228D2fb1627EC";
// StakeDAO Master Chef Contract
const miniChefAddress = "0x68456b298c230415e2de7ad4897a79ee3f1a965a";
// StakeDAO master Chef pool ID for sdam3CRV
const pid = "0";
const sfHost = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
const sfIDA = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";

describe.only("REXStakeDAOToken", function () {

  let sdam3CRVrex;
  let sdam3CRV;
  let alice;
  let owner;
  let minichef;
  let sdtx;

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


    // Delpoy sdam3CRVrex
    const REXStakeDAOTokenHelper = await ethers.getContractFactory("REXStakeDAOTokenHelper");
    let sdam3CRVrexHelper = await REXStakeDAOTokenHelper.deploy();

    const REXStakeDAOToken = await ethers.getContractFactory("REXStakeDAOToken",{
      signer: owner,
      libraries: {
              REXStakeDAOTokenHelper: sdam3CRVrexHelper.address,
      },
    });
    sdam3CRVrex = await REXStakeDAOToken.deploy(sfHost);
    await sdam3CRVrex.deployed();

    // Initialize Ricochet SLP
    await sdam3CRVrex.initialize(
            lpTokenAddress,
            18,
            "Ricochet SLP (USDC/ETH)",
            "SLPr");

    await sdam3CRVrex.setStakeDAOLP(
        sfIDA,
        lpTokenAddress,
        sdtxAddress,
        miniChefAddress,
        pid);


    // Attach alice to the SLP token
    const ERC20 = await ethers.getContractFactory("ERC20");
    sdam3CRV = await ERC20.attach(lpTokenAddress);
    sdam3CRV = sdam3CRV.connect(alice)

    // Attach to MiniCheh
    const MiniChef = await ethers.getContractAt("IMiniChefV2", miniChefAddress);
    minichef = await MiniChef.attach(miniChefAddress);
    minichef = minichef.connect(alice)

    const SDTx = await ethers.getContractFactory("SuperToken");
    sdtx = await SDTx.attach(sdtxAddress);
    sdtx = sdtx.connect(alice)

    sf = new SuperfluidSDK.Framework({
        web3,
        resolverAddress: "0xE0cc76334405EE8b39213E620587d815967af39C",
        tokens: ["WBTC", "DAI", "USDC", "ETH"],
        version: "v1"
    });
    await sf.initialize();

    await web3tx(
        sf.host.callAgreement,
        alice.address + " approves subscription to the app " + sdtx.address
    )(
        sf.agreements.ida.address,
        sf.agreements.ida.contract.methods
            .approveSubscription(sdtx.address, sdam3CRVrex.address, 0, "0x")
            .encodeABI(),
        "0x", // user data
        {
            from: alice.address
        }
    );

    await web3tx(
        sf.host.callAgreement,
        owner.address + " approves subscription to the app " + sdtx.address
    )(
        sf.agreements.ida.address,
        sf.agreements.ida.contract.methods
            .approveSubscription(sdtx.address, sdam3CRVrex.address, 0, "0x")
            .encodeABI(),
        "0x", // user data
        {
            from: owner.address
        }
    );


  });

  context.only("#1 - auto-farming for holders", async function () {

    it("#1.1 - deployed with correct attributes", async function () {
      // TODO
    });

    it("#1.2 - upgrades holder sdam3CRV tokens to sdam3CRVrex", async function () {

      // Alice approves her balance of SLP tokens to be upgraded and upgrades
      let alicesdam3CRVBalance = (await sdam3CRV.balanceOf(alice.address)).toString()
      await sdam3CRV.connect(alice).approve(sdam3CRVrex.address, alicesdam3CRVBalance);
      sdam3CRVrex = await sdam3CRVrex.connect(alice)
      await sdam3CRVrex.upgrade(alicesdam3CRVBalance, {gasLimit: 30000000});

      // Alice has the right amount of sdam3CRVrex
      expect((await sdam3CRVrex.balanceOf(alice.address)).toString()).to.equal(alicesdam3CRVBalance);
      // sdam3CRVrex has SLP on deposit at Mini Chef
      let userInfo = await minichef.userInfo(pid, sdam3CRVrex.address);
      expect(userInfo[0].toString()).to.equal(alicesdam3CRVBalance);

    });

    it("#1.3 - harvests and distributes SDTx rewards to holder", async function () {

      // sdam3CRVrex has tokens on deposit with MiniChef, so just wait then call harvest
      await traveler.advanceTimeAndBlock(360000); // Move forward 1 minute

      let userInfo = await minichef.userInfo(pid, sdam3CRVrex.address);
      let pendingSdt = (await minichef.pendingSdt(pid, sdam3CRVrex.address)).toString()
      await sdam3CRVrex.harvest();

      // SDT tokens are in the contract
      expect((await sdtx.balanceOf(sdam3CRVrex.address)).toNumber()).to.be.above(0);

      // Deployer gets some SDTx
      let ownerBal = (await sdtx.balanceOf(owner.address)).toNumber();
      let aliceBal = (await sdtx.balanceOf(alice.address)).toNumber();
      expect(aliceBal).to.be.above(0);
      expect(ownerBal).to.be.above(0);
      expect(aliceBal / (ownerBal + aliceBal)).to.be.within(0.9,0.900001);

    });

    it("#1.4 - downgrades holders sdam3CRVrex tokens to sdam3CRV", async function () {

      // sdam3CRVrex has tokens on deposit with MiniChef, so just wait then call harvest
      await traveler.advanceTimeAndBlock(3600); // Move forward

      // Alice has sdam3CRVrex from the previous test
      let alicesdam3CRVrexBalance = (await sdam3CRVrex.balanceOf(alice.address)).toString()
      let tx = await sdam3CRVrex.downgrade(alicesdam3CRVrexBalance);

      // After downgrade expect...
      // Alice has her SLP tokens back
      expect((await sdam3CRV.balanceOf(alice.address)).toString()).to.equal(alicesdam3CRVrexBalance);
      // sdam3CRVrex has SLP on deposit at Mini Chef
      let userInfo = await minichef.userInfo(pid, sdam3CRVrex.address);
      expect(userInfo[0]).to.equal(0);
      // Alice gets some SUSHIx and MATICx

      // Deployer gets some SUSHIx and MATICx
      let ownerBal = (await sdtx.balanceOf(owner.address)).toNumber();
      let aliceBal = (await sdtx.balanceOf(alice.address)).toNumber();
      expect(aliceBal).to.be.above(0);
      expect(ownerBal).to.be.above(0);
      expect(aliceBal / (ownerBal + aliceBal)).to.be.within(0.9,0.900001);

    });


  });



});
