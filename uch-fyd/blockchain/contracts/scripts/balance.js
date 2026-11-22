// Muestra la dirección de la wallet configurada en .env y su saldo en Sepolia.
// Sirve para chequear que PRIVATE_KEY y RPC_URL están bien antes del deploy.
const hre = require("hardhat");

async function main() {
  const [cuenta] = await hre.ethers.getSigners();
  const saldo = await hre.ethers.provider.getBalance(cuenta.address);
  console.log(`Cuenta: ${cuenta.address}`);
  console.log(`Saldo:  ${hre.ethers.formatEther(saldo)} ETH (${hre.network.name})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
