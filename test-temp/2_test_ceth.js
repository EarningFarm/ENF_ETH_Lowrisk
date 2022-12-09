const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
const colors = require("colors");
const { utils } = require("ethers");

const { ethContract, uniV2RouterContract, uniV2FactoryContract } = require("../test/externalContracts");

const {
  eth,
  weth,
  notionalProxy,
  note,
  neth,
  ethCurrencyId,
  uniSwapV2Router,
  uniSwapV3Router,
  ethUsdcPath,
  balancerV2Vault,
  balancerETHToUSDCSwap,
  balancerNoteToETHSwap,
  balancerNoteToUSDCAssets,
  balancerNoteToUSDCPools,
  crvUsdcPath,
  crvEthPath,
  curveCRVETH,
  zeroAddress,
} = require("../constants/constants");

let vault, controller, exchange, ceth, uniV2, uniV3, balancer, balancerBatch, curve;

function toEth(num) {
  return utils.formatEther(num);
}

function fromEth(num) {
  return utils.parseEther(num.toString());
}

async function swapETH(caller) {
  await uniV2RouterContract(caller).swapExactETHForTokens(0, [weth, eth], caller.address, 100000000000, {
    value: fromEth(1),
  });
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

    // Deploy Notional
    console.log("Deploying Notional CETH".green);
    const CETH = await ethers.getContractFactory("CEth");
    ceth = await upgrades.deployProxy(CETH, [weth, controller.address, notionalProxy, note, neth, ethCurrencyId]);
    console.log("CETH deployed: ", ceth.address);

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

    console.log("\nDeploying Curve".green);
    const Curve = await ethers.getContractFactory("Curve");
    curve = await Curve.deploy(weth, exchange.address);
    console.log("Curve is deployed: ", curve.address);

    console.log("\nDeploying Balancer".green);
    const Balancer = await ethers.getContractFactory("BalancerV2");
    balancer = await Balancer.deploy(balancerV2Vault, exchange.address, weth);
    console.log("Balancer V2 is Deployed: ", balancer.address);

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

    // Set DepositSlippage on CETH
    await ceth.setDepositSlippage(100);
    console.log("Deposit slippage set");

    // Set WithdrawSlippage on CETH
    await ceth.setWithdrawSlippage(100);
    console.log("Withdraw slippage set");

    // Set CRV-ETH to exchange
    await uniV2.addPath(uniSwapV2Router, crvUsdcPath);

    // Set CRV-ETH to exchange
    await uniV2.addPath(uniSwapV2Router, crvEthPath);

    // Set CRV-ETH to exchange
    await uniV2.addPath(uniSwapV2Router, ethUsdcPath);

    // Set CRV-ETH to CURVE
    await curve.addCurvePool(...curveCRVETH);

    await balancer.addPath(balancerNoteToETHSwap);

    console.log("\nDeploying Balancer BatchSwap".green);
    const BalancerBatch = await ethers.getContractFactory("BalancerBatchV2");
    balancerBatch = await BalancerBatch.deploy(balancerV2Vault, exchange.address, weth);
    console.log("Balancer Batch V2 is Deployed: ", balancerBatch.address);

    // Set swaps on Balancer Batch
    await balancerBatch.addPath(balancerNoteToUSDCPools, balancerNoteToUSDCAssets);

    // Set Routers to exchange
    await exchange.listRouter(uniV2.address);
    await exchange.listRouter(balancer.address);
    await exchange.listRouter(curve.address);
    await exchange.listRouter(balancerBatch.address);

    // Get CRV-ETH path index
    const index = await uniV2.getPathIndex(uniSwapV2Router, ethUsdcPath);
    console.log(`\tNOTE-ETH Path index: ${index}\n`);
  });

  it("Vault Deployed", async () => {
    const name = await vault.name();
    const symbol = await vault.symbol();
    const asset = await vault.asset();
    console.log("\tVault info: ", name, symbol, asset);
  });

  // Register CEth SS
  it("Register CEth with non-owner will be reverted", async () => {
    await expect(controller.connect(alice).registerSubStrategy(ceth.address, 100)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Register CEth as 100 alloc point, check total alloc to be 100, ss length to be 1", async () => {
    await controller.connect(deployer).registerSubStrategy(ceth.address, 100);
    const totalAlloc = await controller.totalAllocPoint();
    const ssLength = await controller.subStrategyLength();

    console.log(`\tTotal Alloc: ${totalAlloc.toNumber()}, ssLength: ${ssLength.toNumber()}`);
    expect(totalAlloc).to.equal(100);
    expect(ssLength).to.equal(1);
  });

  it("Register CEth will be reverted for duplication", async () => {
    await expect(controller.connect(deployer).registerSubStrategy(ceth.address, 100)).to.revertedWith(
      "ALREADY_REGISTERED"
    );
  });

  ///////////////////////////////////////////////////
  //                 DEPOSIT                       //
  ///////////////////////////////////////////////////
  it("Deposit 1eth", async () => {
    // Deposit
    await vault.connect(alice).deposit(fromEth(1), alice.address, { value: fromEth(1) });

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal ETH Balance: ${toEth(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  });

  ///////////////////////////////////////////////////
  //                WITHDRAW                       //
  ///////////////////////////////////////////////////
  it("Withdraw 0.9 ETH", async () => {
    await vault.connect(alice).withdraw(fromEth(0.9), alice.address);
    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal ETH Balance: ${toEth(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  });

  it("Withdraw 0.11 ETH will be reverted", async () => {
    await expect(vault.connect(alice).withdraw(fromEth(0.11), alice.address)).to.revertedWith("EXCEED_TOTAL_DEPOSIT");
  });

  it("Deposit 1 ETH", async () => {
    // Deposit
    await vault.connect(alice).deposit(fromEth(1), alice.address, { value: fromEth(1) });

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal ETH Balance: ${toEth(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  });

  ////////////////////////////////////////////////
  //                  HARVEST                   //
  ////////////////////////////////////////////////

  it("Pass Time and block number", async () => {
    await network.provider.send("evm_increaseTime", [3600 * 24 * 1]);
    await network.provider.send("evm_mine");
  });

  it("Harvest CETH", async () => {
    // Get NOTE-ETH path index
    const index = await balancer.getPathIndex(balancerNoteToETHSwap);
    console.log(`\tNOTE-ETH Path index: ${index}\n`);

    await controller.harvest([0], [index], [balancer.address]);

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal ETH Balance: ${toEth(total)}\n`);
  });

  // it("Pass Time and block number", async () => {
  //   await network.provider.send("evm_increaseTime", [3600 * 24 * 1]);
  //   await network.provider.send("evm_mine");
  // });

  // it("Harvest CETH Balancer-Univ2 multi-swap", async () => {
  //   // Get NOTE-ETH path index
  //   const index0 = await balancer.getPathIndex(balancerNotetoEthSwap);
  //   // const index1 = await balancer.getPathIndex(balancerETHtoEthSwap)
  //   const index1 = await uniV2.getPathIndex(uniSwapV2Router, ethUsdcPath);
  //   console.log(`\tNOTE-ETH Balancer Path index: ${index0}\n`);
  //   console.log(`\tETH-ETH UniV2 Path index: ${index1}\n`);

  //   await controller.harvest([0], [index0, index1], [balancer.address, uniV2.address]);

  //   // Read Total Assets
  //   const total = await vault.totalAssets();
  //   console.log(`\tTotal ETH Balance: ${toEth(total)}\n`);
  // });

  ////////////////////////////////////////////////
  //              EMERGENCY WITHDRAW            //
  ////////////////////////////////////////////////
  it("Emergency Withdraw by non-owner will be reverted", async () => {
    await expect(ceth.connect(alice).emergencyWithdraw()).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Emergency Withdraw", async () => {
    let total = await vault.totalAssets();
    console.log(`\n\tTotal ETH Balance: ${toEth(total)}`);

    await ceth.emergencyWithdraw();
    total = await vault.totalAssets();
    console.log(`\n\tTotal ETH Balance: ${toEth(total)}`);
  });

  // it("Get LP withdrawn", async () => {
  //     const lpBal = await cethContract(alice).balanceOf(deployer.address)
  //     console.log(`\tCEth LP Withdrawn: ${toEth(lpBal)}`)
  // })

  /////////////////////////////////////////////////
  //               OWNER DEPOSIT                 //
  /////////////////////////////////////////////////
  it("Owner deposit will be reverted", async () => {
    await expect(ceth.connect(alice).ownerDeposit(fromEth(100))).to.revertedWith("Ownable: caller is not the owner");
  });

  it("Owner Deposit", async () => {
    await ceth.connect(deployer).ownerDeposit(fromEth(1), { value: fromEth(1) });

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\n\tTotal ETH Balance: ${toEth(total)}`);
  });
});
