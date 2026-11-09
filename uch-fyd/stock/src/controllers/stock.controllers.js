function esEnteroPositivo(valor) {
  return Number.isSafeInteger(valor) && valor > 0;
}

function crearStockController(service) {
  return {
    async obtenerDisponibilidad(req, res, next) {
      try {
        // Los parámetros de la URL llegan como texto.
        const articuloId = Number(req.params.articuloId);

        if (!esEnteroPositivo(articuloId)) {
          return res.status(400).json({
            error: "articuloId debe ser un entero positivo",
          });
        }

        const stock = await service.obtenerDisponibilidad(articuloId);

        if (stock === null) {
          return res.status(404).json({
            error: "Artículo no encontrado",
          });
        }

        return res.json({ articuloId, stock });
      } catch (error) {
        next(error);
      }
    },

    async reservar(req, res, next) {
      try {
        const { articuloId, cantidad } = req.body ?? {};

        if (
          !esEnteroPositivo(articuloId) ||
          !esEnteroPositivo(cantidad)
        ) {
          return res.status(400).json({
            error: "articuloId y cantidad deben ser enteros positivos",
          });
        }

        const reservado = await service.reservar(articuloId, cantidad);

        if (!reservado) {
          return res.status(409).json({
            error: "Stock insuficiente o artículo inexistente",
          });
        }

        return res.status(200).json({
          mensaje: "Stock reservado",
          articuloId,
          cantidad,
        });
      } catch (error) {
        next(error);
      }
    },

    async liberar(req, res, next) {
      try {
        const articuloId = Number(req.params.articuloId);
        const { cantidad } = req.body ?? {};

        if (
          !esEnteroPositivo(articuloId) ||
          !esEnteroPositivo(cantidad)
        ) {
          return res.status(400).json({
            error: "articuloId y cantidad deben ser enteros positivos",
          });
        }

        const liberado = await service.liberar(articuloId, cantidad);

        if (!liberado) {
          return res.status(404).json({
            error: "Artículo no encontrado",
          });
        }

        return res.status(200).json({
          mensaje: "Stock liberado",
          articuloId,
          cantidad,
        });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { crearStockController };