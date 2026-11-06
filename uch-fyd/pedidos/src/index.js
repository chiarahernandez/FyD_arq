
const express = require("express");
const { crearPool } = require("./config/db");
const axios = require("axios");
const { registrarServicio } = require("./config/consul");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.use(express.json());

let pool, consul;

// Resolver las direcciones de los microservicios mediante Consul
async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({
    service: nombreServicio,
    passing: true
  });

  if (!servicios || servicios.length === 0) {
    throw new Error(`No hay instancias disponibles de ${nombreServicio}`);
  }

  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

// Crear un pedido
app.post("/pedidos", async (req, res, next) => {
  const { usuarioId, articuloId, cantidad } = req.body;

  try {
    // 1. Solicitar ejecución al Dynamic Thread Pool
    const urlPool = await resolverInstancia("pool");

    const resPool = await axios.post(`${urlPool}/pool/ejecutar`, {
      tareaId: `${usuarioId}-${Date.now()}`
    });

    if (resPool.data.estado !== "aceptada") {
      return res.status(503).json({
        error: "sistema temporalmente ocupado"
      });
    }

    // 2. Consultar precio en Catálogo
    const urlCatalogo = await resolverInstancia("catalogo");

    const {
      data: { precio }
    } = await axios.get(
      `${urlCatalogo}/articulos/${articuloId}/precio`
    );

    // 3. Reservar stock
    const urlStock = await resolverInstancia("stock");

    const resStock = await axios.post(
      `${urlStock}/stock/reservar`,
      { articuloId, cantidad },
      { validateStatus: () => true }
    );

    if (resStock.status === 409) {
      return res.status(409).json({
        error: "stock insuficiente"
      });
    }

    if (resStock.status !== 200) {
      throw new Error(
        `Error al reservar stock: HTTP ${resStock.status}`
      );
    }

    // 4. Registrar el pedido en MySQL
    try {
      const [ins] = await pool.query(
        `INSERT INTO pedidos
         (usuario_id, articulo_id, cantidad, precio_historico)
         VALUES (?, ?, ?, ?)`,
        [usuarioId, articuloId, cantidad, precio]
      );

      return res.status(201).json({
        pedidoId: ins.insertId
      });

    } catch (errInsert) {
      // Compensación: si falla el INSERT, liberar el stock reservado
      await axios.post(
        `${urlStock}/stock/${articuloId}/liberar`,
        { cantidad }
      );

      throw errInsert;
    }

  } catch (error) {
    // Enviar el error al middleware centralizado
    next(error);
  }
});

// Verificar que el servicio responde
app.get("/health", (_, res) => {
  res.sendStatus(200);
});

// Middleware centralizado de manejo de errores
// Debe estar después de todas las rutas
app.use(errorHandler);

// Inicializar Pedidos
(async () => {
  try {
    // Crear el pool desde config/db.js
    pool = crearPool();

    // Verificar la conexión a MySQL en Aiven
    await pool.query("SELECT 1");

    console.log("Conexión a MySQL en Aiven verificada");

    // Iniciar el servidor y registrar Pedidos en Consul
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
})();
