const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Consul = require("consul");

const app = express();
app.use(express.json());
mongoose.connect(process.env.MONGO_URL);

const Usuario = mongoose.model("Usuario", {
  email: String,
  passwordHash: String,
  activo: { type: Boolean, default: true },
});

app.post("/registro", async (req, res) => {
  const { email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await Usuario.create({ email, passwordHash });
  res.status(201).json({ id: u._id });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const u = await Usuario.findOne({ email });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    return res.status(401).json({ error: "credenciales inválidas" });
  }
  // JWT único = el mismo token sirve para Catálogo, Stock, Pedidos → SSO
  const token = jwt.sign({ sub: u._id, email }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`auth escuchando en ${PORT}`);
  const consul = new Consul({ host: process.env.CONSUL_HOST });
  consul.agent.service.register({
    name: "auth",
    address: "auth",
    port: PORT,
    check: { http: `http://auth:${PORT}/health`, interval: "10s" },
  });
});

app.get("/health", (_, res) => res.sendStatus(200));