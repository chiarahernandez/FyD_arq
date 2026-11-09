const express = require("express");
const { crearPool } = require("./config/db");
const { registrarServicio } = require("./config/consul");
const { crearArticuloRepository } = require("./repositories/articulo.repository");
const { crearArticulosService } = require("./services/articulos.service");
const { crearArticulosController } = require("./controllers/articulos.controller");
const { crearArticulosRoutes } = require("./routes/articulos.routes");
const { suscribirseAEventosDeStock } = require("./services/stockEvents.service");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.use(express.json());

async function iniciar() {
  const pool = crearPool();
  await pool.query("SELECT 1");
  console.log("Conexión a MySQL en Aiven verificada");

  const repo = crearArticuloRepository(pool);
  const service = crearArticulosService(repo);
  const controller = crearArticulosController(service);

  app.use(crearArticulosRoutes(controller));
  app.get("/health", (_, res) => res.sendStatus(200));
  app.use(errorHandler);

  await suscribirseAEventosDeStock(repo); // Fase 4

  app.listen(3002, () => {
    console.log("Catálogo escuchando en el puerto 3002");
    registrarServicio({ nombre: "catalogo", puerto: 3002 });
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar Catálogo:", error.message);
  process.exit(1);
});