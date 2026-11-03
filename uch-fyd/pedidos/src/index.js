const express = require("express");
const mysql = require("mysql2/promise");
const axios = require("axios");
const Consul = require("consul");

const app = express();
app.use(express.json());
let pool, consul;

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

app.post("/pedidos", async (req, res) => {
  const { usuarioId, articuloId, cantidad } = req.body;

  try {
    const urlPool = await resolverInstancia("pool");
    const resPool = await axios.post(`${urlPool}/pool/ejecutar`, { tareaId: `${usuarioId}-${Date.now()}` });
    if (resPool.data.estado !== "aceptada") {
      return res.status(503).json({ error: "sistema temporalmente ocupado" });
    }

    const urlCatalogo = await resolverInstancia("catalogo");
    const { data: { precio } } = await axios.get(`${urlCatalogo}/articulos/${articuloId}/precio`);

    const urlStock = await resolverInstancia("stock");
    const resStock = await axios.post(`${urlStock}/stock/reservar`, { articuloId, cantidad }, { validateStatus: () => true });

    if (resStock.status === 409) {
      return res.status(409).json({ error: "stock insuficiente" });
    }

    try {
      const [ins] = await pool.query(
        "INSERT INTO pedidos (usuario_id, articulo_id, cantidad, precio_historico) VALUES (?, ?, ?, ?)",
        [usuarioId, articuloId, cantidad, precio]
      );
      res.status(201).json({ pedidoId: ins.insertId });
    } catch (errInsert) {
      // compensación: la reserva de stock ya se hizo, pero el pedido no se concretó
      await axios.post(`${urlStock}/stock/${articuloId}/liberar`, { cantidad });
      throw errInsert;
    }
  } catch (e) {
    res.status(500).json({ error: "error interno" });
  }
});

(async () => {
  pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  consul = new Consul({ host: process.env.CONSUL_HOST });
  app.listen(3004, () => {
    consul.agent.service.register({ name: "pedidos", address: "pedidos", port: 3004 });
  });
})();

app.get("/health", (_, res) => res.sendStatus(200));