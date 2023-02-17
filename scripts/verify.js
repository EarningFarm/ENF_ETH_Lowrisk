const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");

const { deployContract, deployUpgradeable, verifyContract, verifyUpgradeable } = require("./utils");
const constants = require("../constants/constants");
const { treasury } = require("./config");
const address = require("./address.json");

async function main() {
  const [deployer] = await ethers.getSigners();

  /////////////////////////////////////////
  //             DEPLOYING               //
  /////////////////////////////////////////

  console.log("\nVerifying Contracts\n".yellow);

  // const adds = [
  //   "0x5AdA9cEa5d3A7805ee63037306BC0C02a512e4E3",
  // ];

  // for (let i = 0; i < adds.length; i++) {
  //   await verifyUpgradeable(adds[i]);
  // }
  await verifyContract("0x319445851BC3b7D0522b98756F7e7B37b6f9DF81", [])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
