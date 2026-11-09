const mysql = require("mysql2/promise");
const fs = require("node:fs");

function crearPool() {
  const port = Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT debe contener un puerto válido");
  }
  return mysql.createPool({
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
}

module.exports = { crearPool };