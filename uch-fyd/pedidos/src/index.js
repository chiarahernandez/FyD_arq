
const express = require("express");
const axios = require("axios");

// Configuración
const { crearPool } = require("./config/db");
const { registrarServicio } = require("./config/consul");

// Capas de la arquitectura
const { crearPedidoRepository } = require("./repositories/pedido.repository");
const { crearPedidosService } = require("./services/pedidos.service");
const { crearPedidosController } = require("./controllers/pedidos.controller");
const { crearPedidosRoutes } = require("./routes/pedidos.routes");

// Manejo de errores
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.use(express.json());

let consul;

// Descubrir microservicios mediante Consul
async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({
    service: nombreServicio,
    passing: true
  });

  if (!servicios || servicios.length === 0) {
    throw new Error(
      `No hay instancias disponibles de ${nombreServicio}`
    );
  }

  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

// Endpoint de salud
app.get("/health", (_, res) => {
  res.sendStatus(200);
});

// Inicializar el microservicio
async function iniciar() {
  try {
    // 1. Conexión a MySQL
    const pool = crearPool();
    await pool.query("SELECT 1");

    console.log("Conexión a MySQL en Aiven verificada");

    // Migración idempotente: agrega nombre_cliente si todavía no existe.
    const [columnas] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'nombre_cliente'`
    );
    if (columnas.length === 0) {
      await pool.query(
        "ALTER TABLE pedidos ADD COLUMN nombre_cliente VARCHAR(150) NOT NULL DEFAULT '' AFTER usuario_id"
      );
      console.log("Migración aplicada: columna nombre_cliente agregada a pedidos");
    }

    // 2. Repository
    const repo = crearPedidoRepository(pool);

    // 3. Service
    const service = crearPedidosService({
      repo,
      resolverInstancia,
      http: axios
    });

    // 4. Controller
    const controller = crearPedidosController(service);

    // 5. Routes
    app.use(crearPedidosRoutes(controller));

    // 6. Middleware de errores
    app.use(errorHandler);

    // 7. Iniciar servidor y registrar en Consul
    app.listen(3004, () => {
      consul = registrarServicio({
        nombre: "pedidos",
        puerto: 3004
      });

      console.log("Pedidos escuchando en 3004");
    });

  } catch (error) {
    console.error(
      "No se pudo iniciar Pedidos:",
      error.message
    );

    process.exit(1);
  }
}

iniciar();
