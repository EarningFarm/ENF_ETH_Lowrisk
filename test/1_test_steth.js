const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
const colors = require("colors");
const { utils } = require("ethers");

const { usdcContract, uniV2RouterContract, uniV2FactoryContract, stethContract } = require("./externalContracts");

const {
  usdc,
  weth,
  convexBooster,
  stethPid,
  stethLP,
  curveSteth,
  crv,
  uniSwapV2Router,
  uniSwapV3Router,
  curveCRVETH,
  balancerV2Vault,
  balancerETHtoETHSwap,
  balancerNotetoETHSwap,
  balancerNotetoETHAssets,
  balancerNotetoETHPools,
  crvUsdcPath,
  crvEthPath,
  ethUsdcPath,
  univ3ETHUSDC,
  univ3CRVETH,
  univ3CRVUSDC,
  curveStEth,
  stEthLP,
  stEthPid,
  zeroAddress,
} = require("../constants/constants");

let vault, controller, steth, depositApprover, exchange, uniV2, curve, uniV3;

function toETH(num) {
  return utils.formatEther(num);
}

function fromETH(num) {
  return utils.parseEther(num.toString());
}

describe("ENF Vault test", async () => {
  before(async () => {
    [deployer, alice, bob, carol, david, evan, fiona, treasury] = await ethers.getSigners();

    // Deploy Vault
    console.log("Deploying Vault".green);
    const Vault = await ethers.getContractFactory("EFVault");
    vault = await upgrades.deployProxy(Vault, [weth, "ENF LP", "ENF"]);
    console.log(`Vault deployed at: ${vault.address}\n`);

    // Deploy Controller
    console.log("Deploying Controller".green);
    const Controller = await ethers.getContractFactory("Controller");
    controller = await upgrades.deployProxy(Controller, [vault.address, zeroAddress, treasury.address, weth]);
    console.log(`Controller deployed at: ${controller.address}\n`);

    // Deploy StETH
    console.log("Deploying STETH".green);
    const StEth = await ethers.getContractFactory("StETH");
    steth = await upgrades.deployProxy(StEth, [curveStEth, stEthLP, controller.address, convexBooster, stEthPid]);
    console.log(`Steth deployed at: ${steth.address}\n`);

    // Deploy Exchange
    console.log("Deploying Exchange".green);
    const Exchange = await ethers.getContractFactory("Exchange");
    exchange = await upgrades.deployProxy(Exchange, [weth, controller.address]);

    // Deploy routers
    console.log("\nDeploying Uni V2 Router".green);
    const UniV2 = await ethers.getContractFactory("UniswapV2");
    uniV2 = await UniV2.deploy(weth, exchange.address);
    console.log("Uni V2 is deployed: ", uniV2.address);

    console.log("\nDeploying Uni V3 Router".green);
    const UniV3 = await ethers.getContractFactory("UniswapV3");
    uniV3 = await UniV3.deploy(uniSwapV3Router, exchange.address, weth);
    console.log("Uni V3 is deployed: ", uniV3.address);

    console.log("\nDeploying Balancer".green);
    const Balancer = await ethers.getContractFactory("BalancerV2");
    balancer = await Balancer.deploy(balancerV2Vault, exchange.address, weth);
    console.log("Balancer V2 is Deployed: ", balancer.address);

    console.log("\nDeploying Curve".green);
    const Curve = await ethers.getContractFactory("Curve");
    curve = await Curve.deploy(weth, exchange.address);
    console.log("Curve is deployed: ", curve.address);

    /**
     * Wiring Contracts with each other
     */
    // Set Controller to vault
    await vault.setController(controller.address);
    console.log("Controller set Vault");

    // Set Exchange to Controller
    await controller.setExchange(exchange.address);

    /**
     * Set configuration
     */

    // Set DepositSlippage on StETH
    await steth.setDepositSlippage(100);
    console.log("Deposit slippage set");

    // Set WithdrawSlippage on StETH
    await steth.setWithdrawSlippage(100);
    console.log("Withdraw slippage set");

    // Set CRV token for harvest token
    await steth.addRewardToken(crv);

    // Set CRV-USDC to exchange
    await uniV2.addPath(uniSwapV2Router, crvUsdcPath);

    // Set CRV-USDC to exchange
    await uniV2.addPath(uniSwapV2Router, crvEthPath);

    // Set CRV-USDC to exchange
    await uniV2.addPath(uniSwapV2Router, ethUsdcPath);

    // Set CRV-USDC to CURVE
    await curve.addCurvePool(...curveCRVETH);

    console.log("\nDeploying Balancer BatchSwap".green);
    const BalancerBatch = await ethers.getContractFactory("BalancerBatchV2");
    balancerBatch = await BalancerBatch.deploy(balancerV2Vault, exchange.address, weth);
    console.log("Balancer Batch V2 is Deployed: ", balancerBatch.address);

    // Get CRV-USDC path index
    const index = await uniV2.getPathIndex(uniSwapV2Router, crvUsdcPath);
    console.log(`\tCRV-USDC Path index: ${index}\n`);

    // Set CRV-USDC to exchange
    await uniV3.addPath(univ3CRVUSDC);
    await uniV3.addPath(univ3CRVETH);
    await uniV3.addPath(univ3ETHUSDC);

    // Set Routers to exchange
    await exchange.listRouter(uniV2.address);
    await exchange.listRouter(curve.address);
    await exchange.listRouter(balancerBatch.address);
    await exchange.listRouter(uniV3.address);
  });

  it("Vault Deployed", async () => {
    const name = await vault.name();
    const symbol = await vault.symbol();
    const asset = await vault.asset();
    console.log("\tVault info: ", name, symbol, asset);
  });

  // Register Steth SS
  it("Register Steth with non-owner will be reverted", async () => {
    await expect(controller.connect(alice).registerSubStrategy(steth.address, 100)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Register Steth as 100 alloc point, check total alloc to be 100, ss length to be 1", async () => {
    await controller.connect(deployer).registerSubStrategy(steth.address, 100);
    const totalAlloc = await controller.totalAllocPoint();
    const ssLength = await controller.subStrategyLength();

    console.log(`\tTotal Alloc: ${totalAlloc.toNumber()}, ssLength: ${ssLength.toNumber()}`);
    expect(totalAlloc).to.equal(100);
    expect(ssLength).to.equal(1);
  });

  it("Register Steth will be reverted for duplication", async () => {
    await expect(controller.connect(deployer).registerSubStrategy(steth.address, 100)).to.revertedWith(
      "ALREADY_REGISTERED"
    );
  });

  ///////////////////////////////////////////////////
  //                 DEPOSIT                       //
  ///////////////////////////////////////////////////
  it("Deposit 1 ETH", async () => {
    // Deposit
    await vault.connect(alice).deposit(fromETH(1), alice.address, { value: fromETH(1) });

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal ETH Balance: ${toETH(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toETH(enf)}`);
  });

  ///////////////////////////////////////////////////
  //                WITHDRAW                       //
  ///////////////////////////////////////////////////
  it("Withdraw 0.9 ETH", async () => {
    await vault.connect(alice).withdraw(fromETH(0.9), alice.address);
    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal ETH Balance: ${toETH(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toETH(enf)}`);
  });

  it("Withdraw 0.11 ETH will be reverted", async () => {
    await expect(vault.connect(alice).withdraw(fromETH(0.11), alice.address)).to.revertedWith("EXCEED_TOTAL_DEPOSIT");
  });

  it("Deposit 1 ETH", async () => {
    await vault.connect(alice).deposit(fromETH(1), alice.address, { value: fromETH(1) });

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal USDC Balance: ${toETH(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toETH(enf)}`);
  });

  //////////////////////////////////////////////
  //              HARVEST                     //
  //////////////////////////////////////////////

  // it("Pass Time and block number", async () => {
  //   await network.provider.send("evm_increaseTime", [3600 * 24 * 60]);
  //   await network.provider.send("evm_mine");
  //   await network.provider.send("evm_mine");
  //   await network.provider.send("evm_mine");
  // });

  // it("Harvest StETH", async () => {
  //   // Get CRV-USDC path index
  //   const index = await uniV2.getPathIndex(uniSwapV2Router, crvUsdcPath);
  //   console.log(`\tCRV-USDC Path index: ${index}\n`);

  //   await controller.harvest([0], [index], [uniV2.address]);

  //   // Read Total Assets
  //   const total = await vault.totalAssets();
  //   console.log(`\tTotal USDC Balance: ${toETH(total)}\n`);
  // });

  ////////////////////////////////////////////////
  //              EMERGENCY WITHDRAW            //
  ////////////////////////////////////////////////
  it("Emergency Withdraw by non-owner will be reverted", async () => {
    await expect(steth.connect(alice).emergencyWithdraw()).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Emergency Withdraw", async () => {
    let total = await vault.totalAssets();
    console.log(`\n\tTotal ETH Balance: ${toETH(total)}`);

    await steth.emergencyWithdraw();

    total = await vault.totalAssets();
    console.log(`\n\tTotal ETH Balance: ${toETH(total)}`);
  });

  it("Get LP withdrawn", async () => {
    const lpBal = await stethContract(alice).balanceOf(deployer.address);
    console.log(`\tSteth LP Withdrawn: ${toETH(lpBal)}`);
  });

  /////////////////////////////////////////////////
  //               OWNER DEPOSIT                 //
  /////////////////////////////////////////////////
  it("Owner deposit will be reverted", async () => {
    await expect(steth.connect(alice).ownerDeposit(fromETH(100))).to.revertedWith("Ownable: caller is not the owner");
  });

  it("Owner Deposit", async () => {
    await steth.connect(deployer).ownerDeposit(fromETH(1), {value: fromETH(1)});

    // Read Total Assets
    const total = await steth.totalAssets(true);
    console.log(`\n\tTotal USDC Balance: ${toETH(total)}`);
  });
});
