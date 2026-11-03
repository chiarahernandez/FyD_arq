const express = require("express");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Consul = require("consul");

const app = express();
app.use(express.json());
let pool, canalEventos;

app.post("/stock/reservar", async (req, res) => {
  const { articuloId, cantidad } = req.body;

  // UPDATE atómico: la condición WHERE stock >= cantidad es el control de concurrencia optimista
  const [result] = await pool.query(
    "UPDATE articulos SET stock = stock - ? WHERE id = ? AND stock >= ?",
    [cantidad, articuloId, cantidad]
  );

  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "stock insuficiente" });
  }

  // publicar evento async, NO bloquea la respuesta
  canalEventos.publish("stock-events", "", Buffer.from(JSON.stringify({ articuloId, cantidad })));

  res.json({ ok: true });
});

// endpoint de compensación para el caso borde (Pedidos falla después de reservar)
app.post("/stock/:articuloId/liberar", async (req, res) => {
  const { cantidad } = req.body;
  await pool.query("UPDATE articulos SET stock = stock + ? WHERE id = ?", [cantidad, req.params.articuloId]);
  res.json({ ok: true });
});

(async () => {
  pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  canalEventos = await conn.createChannel();
  await canalEventos.assertExchange("stock-events", "fanout");

  app.listen(3003, () => {
    new Consul({ host: process.env.CONSUL_HOST }).agent.service.register({ name: "stock", address: "stock", port: 3003 });
  });
})();

app.get("/health", (_, res) => res.sendStatus(200));
