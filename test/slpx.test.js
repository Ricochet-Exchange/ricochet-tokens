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
const ownerAddress = "0x1A50a6238eb67285cCD4DF17f75CCe430BAAE2A4";
const lpTokenAddress = "0x34965ba0ac2451A34a0471F04CCa3F990b8dea27";
const maticxAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
const sushixAddress = "0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b";
const miniChefAddress = "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F";
const pid = "1";
const sfHost = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
const sfIDA = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";

describe("RexToken", function () {

  let rexToken;
  let slp;
  let alice;
  let sfAlice;
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


    // Delpoy RexToken
    const REXTokenHelper = await ethers.getContractFactory("REXTokenHelper");
    let rexTokenHelper = await REXTokenHelper.deploy();

    const RexToken = await ethers.getContractFactory("REXToken",{
      signer: owner,
      libraries: {
              REXTokenHelper: rexTokenHelper.address,
      },
    });
    rexToken = await RexToken.deploy(sfHost);
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
    maticx = await MATICx.attach(maticxAddress);
    maticx = maticx.connect(alice)

    const SUSHIx = await ethers.getContractFactory("SuperToken");
    sushix = await SUSHIx.attach(sushixAddress);
    sushix = sushix.connect(alice)

    sf = new SuperfluidSDK.Framework({
        web3,
        resolverAddress: "0xE0cc76334405EE8b39213E620587d815967af39C",
        tokens: ["WBTC", "DAI", "USDC", "ETH"],
        version: "v1"
    });
    await sf.initialize();

    sfAlice = sf.user({
      address: alice.address,
      token: rexToken.address,
    });

    await web3tx(
        sf.host.callAgreement,
        alice.address + " approves subscription to the app " + sushix.address
    )(
        sf.agreements.ida.address,
        sf.agreements.ida.contract.methods
            .approveSubscription(sushix.address, rexToken.address, 0, "0x")
            .encodeABI(),
        "0x", // user data
        {
            from: alice.address
        }
    );

    await web3tx(
        sf.host.callAgreement,
        owner.address + " approves subscription to the app " + sushix.address
    )(
        sf.agreements.ida.address,
        sf.agreements.ida.contract.methods
            .approveSubscription(sushix.address, rexToken.address, 0, "0x")
            .encodeABI(),
        "0x", // user data
        {
            from: owner.address
        }
    );


  });

  it("should not allow CFA", async function () {
    // Upgrade alices SLP
    let aliceBalance = (await slp.balanceOf(alice.address)).toString()
    await slp.approve(rexToken.address, aliceBalance);
    rexToken = rexToken.connect(alice)
    let tx = await rexToken.upgrade(aliceBalance, "0x");

    await expect(
      sfAlice.flow({ flowRate: "1", recipient: owner.address })
    ).to.be.revertedWith("!unlocked");

    let aliceRexTokenBalance = (await rexToken.balanceOf(alice.address)).toString()
    rexToken = rexToken.connect(alice)
    await rexToken.downgrade(aliceRexTokenBalance);


  });

  it("should be unlockable by owner", async function () {

    // Upgrade alices SLP
    let aliceBalance = (await slp.balanceOf(alice.address)).toString()
    await slp.approve(rexToken.address, aliceBalance);
    rexToken = rexToken.connect(alice)
    let tx = await rexToken.upgrade(aliceBalance, "0x");

    // Unlock allow CFA
    rexToken = rexToken.connect(owner)
    await rexToken.lock(false);
    await sfAlice.flow({ flowRate: "1", recipient: owner.address });
    await sfAlice.flow({ flowRate: "0", recipient: owner.address });

    // Relock don't allow CFA
    await rexToken.lock(true);
    await expect(
      sfAlice.flow({ flowRate: "20", recipient: owner.address })
    ).to.be.revertedWith("!unlocked");

    rexToken = rexToken.connect(owner)
    await rexToken.transfer(alice.address, (await rexToken.balanceOf(owner.address)).toString())
    let aliceRexTokenBalance = (await rexToken.balanceOf(alice.address)).toString()
    rexToken = rexToken.connect(alice)
    await rexToken.downgrade(aliceRexTokenBalance);

  });

  it("upgrades SLP tokens", async function () {

    // Alice might alread have SLPx
    let aliceRexTokenBalance = (await rexToken.balanceOf(alice.address)).toString()
    console.log("Alice rext tokens", aliceRexTokenBalance)

    // Alice approves her balance of SLP tokens to be upgraded and upgrades
    let aliceSLPBalance = await slp.balanceOf(alice.address)
    await slp.approve(rexToken.address, aliceSLPBalance);
    rexToken = rexToken.connect(alice)
    let tx = await rexToken.upgrade(aliceSLPBalance);

    // After upgrade expect...
    // Alice has the right amount of RexToken
    expect((await rexToken.balanceOf(alice.address)).toString()).to.equal((aliceSLPBalance).toString());
    // RexToken has SLP on deposit at Mini Chef
    let userInfo = await minichef.userInfo(pid, rexToken.address);
    expect(userInfo[0].toString()).to.equal(aliceSLPBalance);

  });

  it("harvests SUSHI rewards", async function () {

    // RexToken has tokens on deposit with MiniChef, so just wait then call harvest
    await traveler.advanceTimeAndBlock(60); // Move forward 1 minute

    await rexToken.harvest();

    let userInfo = await minichef.userInfo(pid, rexToken.address);
    let pendingSushi = (await minichef.pendingSushi(pid, rexToken.address)).toString()

    // After harvest expect...
    // RexToken has some SUSHIx and MATICx
    // console.log("SUSHI", (await minichef.userInfo(pid, rexToken.address))[0].toString())

    expect((await sushix.balanceOf(rexToken.address)).toNumber()).to.be.above(0);
    // TODO: Are matic rewards even happening?
    expect((await maticx.balanceOf(rexToken.address)).toNumber()).to.be.above(0);

  });

  it("downgrades RexToken tokens", async function () {

    // RexToken has tokens on deposit with MiniChef, so just wait then call harvest
    await traveler.advanceTimeAndBlock(120); // Move forward 1 minute

    // Alice has RexToken from the previous test
    let aliceRexTokenBalance = (await rexToken.balanceOf(alice.address)).toString()
    let tx = await rexToken.downgrade(aliceRexTokenBalance);

    // After downgrade expect...
    // Alice has her SLP tokens back
    expect((await slp.balanceOf(alice.address)).toString()).to.equal(aliceRexTokenBalance);
    // RexToken has SLP on deposit at Mini Chef
    let userInfo = await minichef.userInfo(pid, rexToken.address);
    expect(userInfo[0]).to.equal(0);
    // Alice gets some SUSHIx and MATICx

    // Deployer gets some SUSHIx
    let ownerBal = (await sushix.balanceOf(owner.address)).toNumber();
    let aliceBal = (await sushix.balanceOf(alice.address)).toNumber();
    expect(ownerBal).to.be.above(0);
    expect(aliceBal).to.be.above(0);
    expect(aliceBal / (ownerBal + aliceBal)).to.equal(0.8);

    // Deployer gets some MATICx
    // Sushi pools run out of MATIC a lot, smh
    ownerBal = (await maticx.balanceOf(owner.address)).toNumber();
    aliceBal = (await maticx.balanceOf(alice.address)).toNumber();
    expect(ownerBal).to.be.above(0);
    expect(aliceBal).to.be.above(0);
    expect(aliceBal / (ownerBal + aliceBal)).to.equal(0.8);

  });

  it("lets the owner burn from account", async function () {
    // Alice has RexToken from the previous test
    // Upgrade alices SLP
    let aliceBalance = (await slp.balanceOf(alice.address)).toString()
    await slp.approve(rexToken.address, aliceBalance);
    rexToken = rexToken.connect(alice)
    let tx = await rexToken.upgrade(aliceBalance);

    let aliceRexTokenBalance = (await rexToken.balanceOf(alice.address)).toString()
    expect(parseInt(aliceRexTokenBalance)).to.be.above(0);
    rexToken = rexToken.connect(owner)
    tx = await rexToken.downgradeFrom(alice.address, aliceRexTokenBalance);
    let aliceSLPBalance = (await slp.balanceOf(alice.address)).toString();
    expect(aliceSLPBalance).to.equal(aliceRexTokenBalance);
    aliceRexTokenBalance = (await rexToken.balanceOf(alice.address)).toString()
    expect(aliceRexTokenBalance).to.equal("0")
  });


});
