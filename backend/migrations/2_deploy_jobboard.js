// migrations/2_deploy.js
const DecentralizedJobBoard = artifacts.require('DecentralizedJobBoard');

module.exports = async (deployer, network, accounts) => {
  await deployer.deploy(DecentralizedJobBoard);
  console.log('Contract deployed to:', DecentralizedJobBoard.address);
};