const express = require("express");
const { crearPool } = require("./config/db");
const { registrarServicio } = require("./config/consul");
const { crearStockRepository } = require("./repositories/stock.repository");
const { crearStockService } = require("./services/stock.service");
const { crearStockController } = require("./controllers/stock.controllers");
const { crearStockRoutes } = require("./routes/stock.routes");
const { publicarEventosDeStock } = require("./services/stockEvents.service");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.use(express.json());

async function iniciar() {
  const pool = crearPool();
  await pool.query("SELECT 1");
  console.log("Conexión a MySQL en Aiven verificada");

  const canal = await publicarEventosDeStock();

  const repo = crearStockRepository(pool);
  const service = crearStockService(repo, canal);
  const controller = crearStockController(service);

  app.use(crearStockRoutes(controller));
  app.get("/health", (_, res) => res.sendStatus(200));
  app.use(errorHandler);

  app.listen(3003, () => {
    console.log("Stock escuchando en el puerto 3003");
    registrarServicio({ nombre: "stock", puerto: 3003 });
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar Stock:", error.code, error.message);
  process.exit(1);
});
