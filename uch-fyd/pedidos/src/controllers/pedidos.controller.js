
function crearPedidosController(service) {
  return {
    async crear(req, res, next) {
      try {
        // 1. Obtener los datos: el usuarioId viene del Gateway (header,
        // ya validado contra el JWT), el resto del body del cliente.
        const usuarioId = req.headers["x-usuario-id"];
        const nombreCliente = req.headers["x-usuario-nombre"] || "";
        const { articuloId, cantidad } = req.body;

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
          nombreCliente,
          articuloId,
          cantidad
        });

        // 4. Devolver la respuesta HTTP
        return res.status(resultado.status).json(resultado.body);

      } catch (error) {
        // 5. Enviar errores inesperados al middleware
        next(error);
      }
    },

    async listar(req, res, next) {
      try {
        const resultado = await service.listarPedidos();
        return res.status(resultado.status).json(resultado.body);
      } catch (error) {
        next(error);
      }
    }
  };
}

module.exports = { crearPedidosController };

