const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");

const { deployContract, deployUpgradeable, verifyContract, verifyUpgradeable } = require("./utils");
const constants = require("../constants/constants");
const { treasury } = require("./config");

async function main() {
  const [deployer] = await ethers.getSigners();

  /////////////////////////////////////////
  //             DEPLOYING               //
  /////////////////////////////////////////

  console.log("\nDeploying Contracts\n".yellow);

  // Deploy Vault
  const vault = await deployUpgradeable(deployer, "EFVault", [constants.weth, "ENF ETH Low Risk LP", "ENF_vETHLow"]);

  // // Deploying Controller
  // const controller = await deployUpgradeable(deployer, "Controller", [
  //   vault.address,
  //   constants.zeroAddress,
  //   treasury,
  //   constants.weth,
  // ]);

  // // Deploying StETH
  // const steth = await deployUpgradeable(deployer, "StETH", [
  //   constants.curveStEth,
  //   constants.stEthLP,
  //   controller.address,
  //   constants.convexBooster,
  //   constants.stEthPid,
  // ]);

  // // Deploying Notional
  // const ceth = await deployUpgradeable(deployer, "CEth", [
  //   controller.address,
  //   constants.notionalProxy,
  //   constants.note,
  //   constants.neth,
  //   constants.ethCurrencyId,
  // ]);

  // ///////////////////////////////////////////
  // //           SET CONFIGURATION           //
  // ///////////////////////////////////////////

  // // Set controller to vault
  // await vault.setController(controller.address);
  // console.log("Controller set vault");

  // // Set Exchange to controller
  // await controller.setExchange(constants.crvExchange);

  // /**
  //  * Substrategies configuration
  //  */
  // // Set DepositSlippage on StETH
  // await steth.setDepositSlippage(100);
  // console.log("Deposit slippage set");

  // // Set WithdrawSlippage on StETH
  // await steth.setWithdrawSlippage(100);
  // console.log("Withdraw slippage set");

  // // Set CRV token for harvest token
  // await steth.addRewardToken(constants.crv);
  // await steth.addRewardToken(constants.cvx);
  
  //   // Set DepositSlippage on CETH
  //   await ceth.setDepositSlippage(100);
  //   console.log("Deposit slippage set");

  //   // Set WithdrawSlippage on CETH
  //   await ceth.setWithdrawSlippage(100);
  //   console.log("Withdraw slippage set");

  // // Register Substrategies
  // await controller.connect(deployer).registerSubStrategy(steth.address, 100);
  // let totalAlloc = await controller.totalAllocPoint();
  // let ssLength = await controller.subStrategyLength();

  // await controller.connect(deployer).registerSubStrategy(ceth.address, 100);
  // totalAlloc = await controller.totalAllocPoint();
  // ssLength = await controller.subStrategyLength();
  // console.log(`\tTotal Alloc: ${totalAlloc.toNumber()}, ssLength: ${ssLength.toNumber()}`);

  // // Output deployed address result
  // const deployLog = [
  //   {
  //     Label: "ENF Vault address",
  //     Info: vault.address,
  //   },
  //   {
  //     Label: "Controller address",
  //     Info: controller.address,
  //   },
  //   {
  //     Label: "StETH address",
  //     Info: steth.address,
  //   },
  //   {
  //     Label: "CETH address",
  //     Info: ceth.address,
  //   }
  // ];

  // console.table(deployLog);

  // Save data to json
  const data = {};
  for (let i = 0; i < deployLog.length; i++) {
    data[deployLog[i].Label] = deployLog[i].Info;
  }
  fs.writeFileSync("./scripts/address.json", JSON.stringify(data));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
