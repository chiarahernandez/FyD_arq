function leerId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function crearBlockchainController(service) {
  return {
    async estado(req, res, next) {
      try {
        const id = leerId(req);
        if (!id) return res.status(400).json({ error: "id de pedido inválido" });

        // Identidad validada por el Gateway contra el JWT.
        const resultado = await service.obtenerEstado(id, {
          usuarioId: req.headers["x-usuario-id"],
          rol: req.headers["x-usuario-rol"],
        });
        return res.status(resultado.status).json(resultado.body);
      } catch (error) {
        next(error);
      }
    },

    async reintentar(req, res, next) {
      try {
        const id = leerId(req);
        if (!id) return res.status(400).json({ error: "id de pedido inválido" });

        const resultado = await service.reintentar(id);
        return res.status(resultado.status).json(resultado.body);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { crearBlockchainController };
