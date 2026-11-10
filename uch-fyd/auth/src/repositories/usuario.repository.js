const Usuario = require("../models/usuario.model");

const usuarioRepository = {
  async findByEmail(email) {
    return Usuario.findOne({ email });
  },

  async crear({ email, nombre, passwordHash }) {
    const u = await Usuario.create({ email, nombre, passwordHash });
    return u._id;
  },

  async activar(id) {
    const resultado = await Usuario.updateOne({ _id: id }, { $set: { activo: true } });
    return resultado.matchedCount > 0;
  },

  async cambiarRol(id, rol) {
    const resultado = await Usuario.updateOne({ _id: id }, { $set: { rol } });
    return resultado.matchedCount > 0;
  },
};

module.exports = usuarioRepository;
