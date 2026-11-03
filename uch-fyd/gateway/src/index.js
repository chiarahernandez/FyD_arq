
const express = require("express");
const jwt = require("jsonwebtoken");
const { createProxyMiddleware } = require("http-proxy-middleware");
const Consul = require("consul");

const app = express();
const consul = new Consul({ host: process.env.CONSUL_HOST });

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

function validarJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);
  try {
    req.usuario = jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
}

app.use("/auth", createProxyMiddleware({ target: "http://auth:3001", changeOrigin: true }));

app.use("/pedidos", validarJWT, async (req, res, next) => {
  const target = await resolverInstancia("pedidos");
  createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
});

app.use("/catalogo", validarJWT, async (req, res, next) => {
  const target = await resolverInstancia("catalogo");
  createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
});

app.listen(3000, () => console.log("gateway en 3000"));
