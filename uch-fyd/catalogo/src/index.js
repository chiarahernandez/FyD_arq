const express = require("express");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Consul = require("consul");
const fs = require("node:fs");

const app = express();
app.use(express.json());

let pool;

app.get("/articulos/:id/precio", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT precio FROM articulos WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) return res.sendStatus(404);
    res.json({ precio: rows[0].precio });
  } catch (error) {
    next(error);
  }
});

app.get("/articulos", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nombre, precio FROM articulos"
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_, res) => res.sendStatus(200));

app.use((error, req, res, next) => {
  console.error("Error en Catálogo:", error.code, error.message);
  res.status(500).json({ error: "No se pudo completar la consulta" });
});

async function suscribirseAEventosDeStock() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();

  await ch.assertExchange("stock-events", "fanout");

  const { queue } = await ch.assertQueue("", { exclusive: true });
  await ch.bindQueue(queue, "stock-events", "");

  await ch.consume(queue, (msg) => {
    if (!msg) return;

    try {
      const evento = JSON.parse(msg.content.toString());
      console.log("Stock actualizado (async):", evento);
      ch.ack(msg);
    } catch (error) {
      console.error("Evento inválido:", error.message);
      ch.nack(msg, false, false);
    }
  });
}

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

  await suscribirseAEventosDeStock();

  app.listen(3002, () => {
    console.log("Catálogo escuchando en el puerto 3002");

    const consul = new Consul({ host: process.env.CONSUL_HOST });
    consul.agent.service.register(
      { name: "catalogo", address: "catalogo", port: 3002 },
      (error) => {
        if (error) {
          console.error("Error al registrar Catálogo en Consul:", error.message);
          return;
        }
        console.log("Catálogo registrado en Consul");
      }
    );
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar Catálogo:", error.code, error.message);
  process.exit(1);
});