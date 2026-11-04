const express = require("express");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Consul = require("consul");
const fs = require("node:fs");

const app = express();
app.use(express.json());

let pool;
let canalEventos;

app.post("/stock/reservar", async (req, res, next) => {
  const { articuloId, cantidad } = req.body;

  if (
    !Number.isSafeInteger(articuloId) ||
    articuloId <= 0 ||
    !Number.isSafeInteger(cantidad) ||
    cantidad <= 0
  ) {
    return res.status(400).json({
      error: "articuloId y cantidad deben ser números enteros positivos",
    });
  }

  try {
    // Descuenta únicamente si hay stock suficiente, en una operación atómica.
    const [result] = await pool.query(
      "UPDATE articulos SET stock = stock - ? WHERE id = ? AND stock >= ?",
      [cantidad, articuloId, cantidad]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        error: "Stock insuficiente o artículo inexistente",
      });
    }

    // La reserva ya se aplicó. Registramos por separado un fallo del evento.
    try {
      canalEventos.publish(
        "stock-events",
        "",
        Buffer.from(JSON.stringify({ articuloId, cantidad }))
      );
    } catch (error) {
      console.error(
        "Reserva realizada, pero falló la publicación del evento:",
        error.message
      );
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Compensación cuando Pedidos no consigue guardar el pedido.
app.post("/stock/:articuloId/liberar", async (req, res, next) => {
  const articuloId = Number(req.params.articuloId);
  const { cantidad } = req.body;

  if (
    !Number.isSafeInteger(articuloId) ||
    articuloId <= 0 ||
    !Number.isSafeInteger(cantidad) ||
    cantidad <= 0
  ) {
    return res.status(400).json({
      error: "articuloId y cantidad deben ser números enteros positivos",
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE articulos SET stock = stock + ? WHERE id = ?",
      [cantidad, articuloId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Artículo inexistente" });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_, res) => res.sendStatus(200));

app.use((error, req, res, next) => {
  console.error("Error en Stock:", error.code, error.message);
  res.status(500).json({
    error: "No se pudo completar la operación de stock",
  });
});

async function iniciar() {
  const port = Number(process.env.DB_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT debe contener un puerto válido");
  }

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
      ca: fs.readFileSync(process.env.DB_CA_PATH, "utf8"),
      rejectUnauthorized: true,
      verifyIdentity: true,
    },
  });

  await pool.query("SELECT 1");
  console.log("Conexión a MySQL en Aiven verificada");

  const conn = await amqp.connect(process.env.RABBITMQ_URL);

  conn.on("error", (error) => {
    console.error("Error de conexión con RabbitMQ:", error.message);
  });

  conn.on("close", () => {
    console.error("Se cerró la conexión con RabbitMQ");
    process.exit(1);
  });

  canalEventos = await conn.createChannel();

  canalEventos.on("error", (error) => {
    console.error("Error en el canal de RabbitMQ:", error.message);
  });

  canalEventos.on("close", () => {
    console.error("Se cerró el canal de RabbitMQ");
    process.exit(1);
  });

  await canalEventos.assertExchange("stock-events", "fanout");
  console.log("Conexión a RabbitMQ verificada");

  app.listen(3003, () => {
    console.log("Stock escuchando en el puerto 3003");

    const consul = new Consul({ host: process.env.CONSUL_HOST });

    consul.agent.service.register(
      {
        name: "stock",
        address: "stock",
        port: 3003,
      },
      (error) => {
        if (error) {
          console.error(
            "Error al registrar Stock en Consul:",
            error.message
          );
          return;
        }

        console.log("Stock registrado en Consul");
      }
    );
  });
}

iniciar().catch((error) => {
  console.error(
    "No se pudo iniciar Stock:",
    error.code,
    error.message
  );
  process.exit(1);
});