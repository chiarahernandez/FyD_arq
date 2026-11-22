
const SIN_EVENTOS = { publicarPedidoCreado: async () => {} };

function crearPedidosService({ repo, resolverInstancia, http, eventos = SIN_EVENTOS }) {
  return {
    async crearPedido({ usuarioId, nombreCliente, articuloId, cantidad }) {

      // 1. Solicitar ejecución al Pool Java
      const urlPool = await resolverInstancia("pool");

      const resPool = await http.post(
        `${urlPool}/pool/ejecutar`,
        { tareaId: `${usuarioId}-${Date.now()}` }
      );

      if (resPool.data.estado !== "aceptada") {
        return {
          status: 503,
          body: { error: "sistema temporalmente ocupado" }
        };
      }

      // 2. Consultar el precio en Catálogo
      const urlCatalogo = await resolverInstancia("catalogo");

      const {
        data: { precio }
      } = await http.get(
        `${urlCatalogo}/articulos/${articuloId}/precio`
      );

      // 3. Reservar stock
      const urlStock = await resolverInstancia("stock");

      const resStock = await http.post(
        `${urlStock}/stock/reservar`,
        { articuloId, cantidad },
        { validateStatus: () => true }
      );

      if (resStock.status === 409) {
        return {
          status: 409,
          body: { error: "stock insuficiente" }
        };
      }

      if (resStock.status !== 200) {
        throw new Error(
          `Error al reservar stock: HTTP ${resStock.status}`
        );
      }

      // 4. Calcular el importe total
      const importeTotal = Number(
        (precio * cantidad).toFixed(2)
      );

      // 5. Guardar el pedido mediante el Repository
      let pedidoId;
      try {
        pedidoId = await repo.crear({
          usuarioId,
          nombreCliente,
          articuloId,
          cantidad,
          precioUnitario: precio,
          importeTotal
        });

      } catch (errInsert) {
        // Compensación si falla el registro del pedido
        await http.post(
          `${urlStock}/stock/${articuloId}/liberar`,
          { cantidad }
        );

        throw errInsert;
      }

      // 6. Avisar que se creó el pedido (lo consume el servicio Blockchain).
      // Va fuera del try: publicarPedidoCreado nunca lanza, y si fallara no
      // tiene que disparar la compensación de stock de un pedido ya guardado.
      await eventos.publicarPedidoCreado({
        pedidoId,
        usuarioId,
        articuloId,
        cantidad,
        precioUnitario: precio,
        importeTotal
      });

      return {
        status: 201,
        body: {
          pedidoId,
          precioUnitario: precio,
          importeTotal
        }
      };
    },
    async obtenerPedido(pedidoId) {
      const pedido = await repo.obtenerPorId(pedidoId);
      if (!pedido) {
        return { status: 404, body: { error: "pedido no encontrado" } };
      }
      return { status: 200, body: pedido };
    },
    async listarPedidos() {
      const pedidos = await repo.listar();
      return { status: 200, body: pedidos };
    }
  };
}

module.exports = { crearPedidosService };
