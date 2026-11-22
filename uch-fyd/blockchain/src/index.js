const express = require("express");
const axios = require("axios");
const Consul = require("consul");

const { crearPool } = require("./config/db");
const { registrarServicio } = require("./config/consul");
const { conectarBlockchain } = require("./config/blockchain");
const { crearRegistroRepository } = require("./repositories/registro.repository");
const { crearBlockchainService } = require("./services/blockchain.service");
const { consumirPedidosCreados } = require("./services/pedidosEvents.service");
const { crearBlockchainController } = require("./controllers/blockchain.controller");
const { crearBlockchainRoutes } = require("./routes/blockchain.routes");
const errorHandler = require("./middlewares/errorHandler");

const PUERTO = 3006;
const app = express();
app.use(express.json());
app.get("/health", (_, res) => res.sendStatus(200));

const consul = new Consul({ host: process.env.CONSUL_HOST });

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  if (!servicios || servicios.length === 0) {
    throw new Error(`No hay instancias disponibles de ${nombreServicio}`);
  }
  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

// Lee el pedido desde el servicio Pedidos (no desde su tabla): null si no existe.
async function obtenerPedido(pedidoId) {
  const url = await resolverInstancia("pedidos");
  const res = await axios.get(`${url}/internal/pedidos/${pedidoId}`, { validateStatus: () => true });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`Pedidos respondió HTTP ${res.status}`);
  return res.data;
}

async function iniciar() {
  const pool = crearPool();
  await pool.query("SELECT 1");
  console.log("Conexión a MySQL en Aiven verificada");

  const repo = crearRegistroRepository(pool);
  await repo.inicializar();

  const chain = await conectarBlockchain();

  const service = crearBlockchainService({
    repo,
    chain,
    obtenerPedido,
    etherscanBase: process.env.ETHERSCAN_BASE_URL || "https://sepolia.etherscan.io",
  });

  await consumirPedidosCreados(service.registrar);

  app.use(crearBlockchainRoutes(crearBlockchainController(service)));
  app.use(errorHandler);

  app.listen(PUERTO, () => {
    console.log(`Blockchain escuchando en ${PUERTO}`);
    registrarServicio({ nombre: "blockchain", puerto: PUERTO });
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar Blockchain:", error.shortMessage || error.message);
  process.exit(1);
});
