const MetaCoin = artifacts.require("MetaCoin");

contract('MetaCoin', (accounts) => {
  it('should deploy with correct attributes', async () => {
    const metaCoinInstance = await MetaCoin.deployed();

    // TODO: HH > Truffle
    expect(await slpx.getLpTokenAddress()).to.equal("Hello, world!");
    expect(await slpx.getMaticxTokenAddress()).to.equal("Hello, world!");
    expect(await slpx.getSushixTokenAddress()).to.equal("Hello, world!");
    expect(await slpx.getMiniChefAddress()).to.equal("Hello, world!");
    expect(await slpx.getPid()).to.equal("Hello, world!");
  });
  it('should upgrade SLP tokens', async () => {
    const metaCoinInstance = await MetaCoin.deployed();
    const metaCoinBalance = (await metaCoinInstance.getBalance.call(accounts[0])).toNumber();
    const metaCoinEthBalance = (await metaCoinInstance.getBalanceInEth.call(accounts[0])).toNumber();

    assert.equal(metaCoinEthBalance, 2 * metaCoinBalance, 'Library function returned unexpected function, linkage may be broken');

    // TODO: HH > Truffle
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
  it('should harvest SUSHI and MATIC rewards', async () => {
    // TODO: HH > Truffle
    // SLPx has tokens on deposit with MiniChef, so just wait then call harvest
    await traveler.advanceTimeAndBlock(60*60*24); // Move forward 1 day

    await slpx.harvest();

    // After harvest expect...
    // SLPx has some SUSHIx and MATICx
    expect((await sushix.balanceOf(alice.address)).toString()).to.be.above(0);
    expect((await maticx.balanceOf(alice.address)).toString()).to.be.above(0);
  });
  it('should downgrade SLPx', async () => {
    // TODO: HH > Truffle
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
