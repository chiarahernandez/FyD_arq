const path = require("node:path");
require("@nomicfoundation/hardhat-toolbox");

// Usa el mismo .env que docker-compose (uch-fyd/.env), así las claves viven en un solo lugar.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

const networks = {};
if (RPC_URL && PRIVATE_KEY) {
  networks.sepolia = {
    url: RPC_URL,
    accounts: [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`],
    chainId: 11155111,
  };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks,
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  sourcify: { enabled: false },
};
