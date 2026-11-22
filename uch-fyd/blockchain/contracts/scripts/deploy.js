// Despliega RegistroPedidos. Se corre UNA sola vez por red:
//   npm run deploy:sepolia
// Deja la dirección en deployments/<red>.json y la ABI en ../src/contract/
// para que el servicio blockchain la use sin necesitar Hardhat.
const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const red = hre.network.name;
  const saldo = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Red:       ${red}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Saldo:     ${hre.ethers.formatEther(saldo)} ETH`);

  const contrato = await hre.ethers.deployContract("RegistroPedidos");
  const tx = contrato.deploymentTransaction();
  console.log(`Tx deploy: ${tx.hash} (esperando confirmación...)`);
  await contrato.waitForDeployment();
  const receipt = await tx.wait();
  const direccion = await contrato.getAddress();

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${red}.json`),
    JSON.stringify(
      {
        red,
        chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
        direccion,
        owner: deployer.address,
        txHash: tx.hash,
        bloque: receipt.blockNumber,
        fecha: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const artifact = await hre.artifacts.readArtifact("RegistroPedidos");
  const abiDir = path.join(__dirname, "..", "..", "src", "contract");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(path.join(abiDir, "RegistroPedidos.abi.json"), JSON.stringify(artifact.abi, null, 2));

  console.log(`\nContrato desplegado en ${direccion}`);
  if (red === "hardhat") {
    console.log("(Red local efímera: sirve solo para probar el script y generar la ABI.)");
  } else {
    console.log(`Agregá esto a uch-fyd/.env:\n  CONTRACT_ADDRESS=${direccion}`);
  }
  if (red === "sepolia") {
    console.log(`Etherscan: https://sepolia.etherscan.io/address/${direccion}`);
    console.log(`Verificar código: npm run verify:sepolia -- ${direccion}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
