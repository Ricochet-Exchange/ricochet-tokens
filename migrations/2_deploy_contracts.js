const SLPxStorage = artifacts.require("SLPxStorage");
const SLPxHelper = artifacts.require("SLPxHelper");
const RicochetToken = artifacts.require("RicochetToken");

module.exports = function(deployer) {
  deployer.deploy(SLPxHelper);
  deployer.deploy(SLPxStorage);
  deployer.link(SLPxHelper, RicochetToken);
  deployer.link(SLPxStorage, RicochetToken);
  deployer.deploy(RicochetToken);
};
