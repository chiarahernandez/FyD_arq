const mongoose = require("mongoose");

const Usuario = mongoose.model("Usuario", {
  email: { type: String, required: true, unique: true }, // unique habilita el 409 (ver 2.7)
  nombre: { type: String },                                // PB-01: faltaba
  passwordHash: String,
  activo: { type: Boolean, default: false },                // antes: true (al revés de lo pedido)
});

module.exports = Usuario;