const Usuario = require("../models/usuario.model");

async function activar(id) {
  const resultado = await Usuario.updateOne(
    { _id: id },
    { $set: { activo: true } }
  );

  return resultado.matchedCount > 0;
}

module.exports = { activar };