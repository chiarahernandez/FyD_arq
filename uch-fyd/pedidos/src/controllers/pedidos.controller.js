
function crearPedidosController(service) {
  return {
    async crear(req, res, next) {
      try {
        // 1. Obtener los datos enviados por el usuario
        const { usuarioId, articuloId, cantidad } = req.body;

        // 2. Validar los datos recibidos
        if (
          !usuarioId ||
          !Number.isInteger(articuloId) ||
          articuloId <= 0 ||
          !Number.isInteger(cantidad) ||
          cantidad <= 0
        ) {
          return res.status(400).json({
            error: "Datos del pedido inválidos"
          });
        }

        // 3. Llamar al Service para crear el pedido
        const resultado = await service.crearPedido({
          usuarioId,
          articuloId,
          cantidad
        });

        // 4. Devolver la respuesta HTTP
        return res.status(resultado.status).json(resultado.body);

      } catch (error) {
        // 5. Enviar errores inesperados al middleware
        next(error);
      }
    }
  };
}

module.exports = { crearPedidosController };

