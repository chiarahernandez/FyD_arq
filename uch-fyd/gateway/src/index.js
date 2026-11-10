
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createProxyMiddleware } = require("http-proxy-middleware");
const Consul = require("consul");

const app = express();
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

const consul = new Consul({ host: process.env.CONSUL_HOST });

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  if (!servicios || servicios.length === 0) {
    throw new Error(`No hay instancias disponibles de ${nombreServicio}`);
  }
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

function requireAdmin(req, res, next) {
  if (req.usuario?.rol !== "admin") {
    return res.status(403).json({ error: "esta acción requiere rol de administrador" });
  }
  next();
}

// --- Rutas de administración: JWT + rol admin. Van ANTES de los proxies genéricos,
// si no Express nunca llega a estas rutas más específicas (Fase 1.11). ---
app.patch("/auth/usuarios/:id/activar", validarJWT, requireAdmin, (req, res, next) => {
  createProxyMiddleware({
    target: "http://auth:3001",
    changeOrigin: true,
    pathRewrite: { "^/auth": "" },
  })(req, res, next);
});

app.patch("/auth/usuarios/:id/rol", validarJWT, requireAdmin, (req, res, next) => {
  createProxyMiddleware({
    target: "http://auth:3001",
    changeOrigin: true,
    pathRewrite: { "^/auth": "" },
  })(req, res, next);
});

app.post("/catalogo/articulos", validarJWT, requireAdmin, async (req, res, next) => {
  try {
    const target = await resolverInstancia("catalogo");
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { "^/catalogo": "" },
    })(req, res, next);
  } catch (error) {
    console.error("Error resolviendo catalogo (POST /articulos):", error.message);
    res.status(503).json({ error: "servicio catalogo no disponible" });
  }
});

app.patch("/catalogo/articulos/:id/precio", validarJWT, requireAdmin, async (req, res, next) => {
  try {
    const target = await resolverInstancia("catalogo");
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { "^/catalogo": "" },
    })(req, res, next);
  } catch (error) {
    console.error("Error resolviendo catalogo (PATCH precio):", error.message);
    res.status(503).json({ error: "servicio catalogo no disponible" });
  }
});

app.use("/auth", createProxyMiddleware({ target: "http://auth:3001", changeOrigin: true }));

// Listado de todos los pedidos (con nombre del cliente) — solo admin.
// Ruta exacta registrada ANTES del proxy genérico de /pedidos para que gane precedencia.
app.get("/pedidos", validarJWT, requireAdmin, async (req, res, next) => {
  try {
    const target = await resolverInstancia("pedidos");
    createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
  } catch (error) {
    console.error("Error resolviendo pedidos (GET lista):", error.message);
    res.status(503).json({ error: "servicio pedidos no disponible" });
  }
});

app.use("/pedidos", validarJWT, async (req, res, next) => {
  try {
    const target = await resolverInstancia("pedidos");
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { "^/": "/pedidos" },
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader("X-Usuario-Id", req.usuario.sub);
          proxyReq.setHeader("X-Usuario-Nombre", req.usuario.nombre ?? "");
        },
      },
    })(req, res, next);
  } catch (error) {
    console.error("Error resolviendo pedidos:", error.message);
    res.status(503).json({ error: "servicio pedidos no disponible" });
  }
});

app.use("/catalogo", validarJWT, async (req, res, next) => {
  try {
    const target = await resolverInstancia("catalogo");
    createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
  } catch (error) {
    console.error("Error resolviendo catalogo (proxy genérico):", error.message);
    res.status(503).json({ error: "servicio catalogo no disponible" });
  }
});

app.use("/stock", validarJWT, async (req, res, next) => {
  try {
    const target = await resolverInstancia("stock");
    createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
  } catch (error) {
    console.error("Error resolviendo stock:", error.message);
    res.status(503).json({ error: "servicio stock no disponible" });
  }
});

app.listen(3000, () => console.log("gateway en 3000"));
