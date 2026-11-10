const { registrar, login } = require("../services/auth.service");
const { activarUsuario, cambiarRolUsuario } = require("../services/admin.service");

function crearAuthController({ repo, bcrypt, jwt, jwtSecret }) {
  return {
    async registrar(req, res, next) {
      try {
        const { email, password, nombre } = req.body;
        if (!email || !password) {
          return res.status(400).json({ error: "email y password son obligatorios" });
        }
        const id = await registrar({ email, nombre, password }, { repo, bcrypt });
        res.status(201).json({ id });
      } catch (error) {
        if (error.code === 11000) {
          return res.status(409).json({ error: "ese email ya está registrado" });
        }
        next(error);
      }
    },

    async login(req, res, next) {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).json({ error: "email y password son obligatorios" });
        }
        const resultado = await login({ email, password }, { repo, bcrypt, jwt, jwtSecret });
        res.status(resultado.status).json(resultado.body);
      } catch (error) {
        next(error);
      }
    },

    async activar(req, res, next) {
      try {
        await activarUsuario(req.params.id, repo);
        res.sendStatus(200);
      } catch (error) {
        if (error.status === 404) return res.sendStatus(404);
        next(error);
      }
    },

    async cambiarRol(req, res, next) {
      try {
        const { rol } = req.body;
        await cambiarRolUsuario(req.params.id, rol, repo);
        res.sendStatus(200);
      } catch (error) {
        if (error.status === 400 || error.status === 404) {
          return res.status(error.status).json({ error: error.message });
        }
        next(error);
      }
    },
  };
}

module.exports = { crearAuthController };
