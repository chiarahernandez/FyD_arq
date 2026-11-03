const express = require("express");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Consul = require("consul");

const app = express();
app.use(express.json());
let pool;

app.get("/articulos/:id/precio", async (req, res) => {
  const [rows] = await pool.query("SELECT precio FROM articulos WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.sendStatus(404);
  res.json({ precio: rows[0].precio });
});

app.get("/articulos", async (_, res) => {
  const [rows] = await pool.query("SELECT id, nombre, precio FROM articulos");
  res.json(rows);
});

async function suscribirseAEventosDeStock() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange("stock-events", "fanout");
  const { queue } = await ch.assertQueue("", { exclusive: true });
  await ch.bindQueue(queue, "stock-events", "");
  ch.consume(queue, (msg) => {
    const evento = JSON.parse(msg.content.toString());
    console.log("Stock actualizado (async):", evento); // acá se podría refrescar un caché de disponibilidad
    ch.ack(msg);
  });
}

(async () => {
  pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await suscribirseAEventosDeStock();
  app.listen(3002, () => {
    new Consul({ host: process.env.CONSUL_HOST }).agent.service.register({ name: "catalogo", address: "catalogo", port: 3002 });
  });
})();

app.get("/health", (_, res) => res.sendStatus(200));