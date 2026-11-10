const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { conectar } = require("./config/db");
const { registrarServicio } = require("./config/consul");
const repo = require("./repositories/usuario.repository");
const { crearAuthController } = require("./controllers/auth.controller");
const { crearAuthRoutes } = require("./routes/auth.routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.use(express.json());

async function iniciar() {
  await conectar();

  const controller = crearAuthController({
    repo,
    bcrypt,
    jwt,
    jwtSecret: process.env.JWT_SECRET,
  });

  app.use(crearAuthRoutes(controller));
  app.get("/health", (_, res) => res.sendStatus(200));
  app.use(errorHandler);

  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`auth escuchando en ${PORT}`);
    registrarServicio({ nombre: "auth", puerto: PORT });
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar Auth:", error.message);
  process.exit(1);
});
