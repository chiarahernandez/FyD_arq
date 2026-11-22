const { ethers } = require("ethers");
const abi = require("../contract/RegistroPedidos.abi.json");

// Conecta con la red (Sepolia por defecto) y valida, antes de aceptar trabajo, que:
//  - estén las variables de entorno,
//  - haya un contrato desplegado en CONTRACT_ADDRESS,
//  - la wallet de PRIVATE_KEY sea la owner del contrato (si no, todo registro revertiría).
async function conectarBlockchain() {
  const { RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS } = process.env;
  const faltantes = ["RPC_URL", "PRIVATE_KEY", "CONTRACT_ADDRESS"].filter((v) => !process.env[v]);
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(", ")}`);
  }

  const chainId = Number(process.env.CHAIN_ID || 11155111);
  const red = ethers.Network.from(chainId);
  // cacheTimeout -1: sin caché de respuestas (por defecto ethers cachea 250 ms y
  // puede devolver un nonce viejo si dos transacciones salen muy seguidas).
  const provider = new ethers.JsonRpcProvider(RPC_URL, red, { staticNetwork: red, cacheTimeout: -1 });
  const clave = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const wallet = new ethers.Wallet(clave, provider);
  const contrato = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  const codigo = await provider.getCode(CONTRACT_ADDRESS);
  if (codigo === "0x") {
    throw new Error(`No hay ningún contrato en ${CONTRACT_ADDRESS} (chainId ${chainId})`);
  }

  const owner = await contrato.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`La wallet ${wallet.address} no es la owner del contrato (${owner})`);
  }

  const saldo = await provider.getBalance(wallet.address);
  console.log(
    `Blockchain conectada: chainId ${chainId}, contrato ${CONTRACT_ADDRESS}, ` +
      `wallet ${wallet.address} (${ethers.formatEther(saldo)} ETH)`
  );

  return { provider, wallet, contrato, chainId, direccion: CONTRACT_ADDRESS };
}

module.exports = { conectarBlockchain };
