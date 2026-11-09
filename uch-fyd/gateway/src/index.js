
const express = require("express");
const Consul = require("consul");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const { crearCatalogoProxy } = require("./routes/catalogo.routes");
const { crearPedidosProxy } = require("./routes/pedidos.routes");
const validarJWT = require("./middlewares/validarJWT");

const app = express();
const consul = new Consul({ host: process.env.CONSUL_HOST });

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  const instancia = servicios[0];

  if (!instancia) {
    throw new Error(`No hay instancias disponibles para el servicio "${nombreServicio}"`);
  }

  const { Address, Port } = instancia.Service;
  if (!Address || !Port) {
    throw new Error(`La instancia de "${nombreServicio}" no tiene dirección o puerto`);
  }

  return `http://${Address}:${Port}`;
}

app.use("/auth", authRoutes);
app.use("/catalogo", validarJWT, crearCatalogoProxy(resolverInstancia));
app.use("/pedidos", validarJWT, crearPedidosProxy(resolverInstancia));

app.listen(3000, () => console.log("gateway en 3000"));
