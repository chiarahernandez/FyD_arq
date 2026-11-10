
function crearPedidosService({ repo, resolverInstancia, http }) {
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
      try {
        const pedidoId = await repo.crear({
          usuarioId,
          nombreCliente,
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

      } catch (errInsert) {
        // Compensación si falla el registro del pedido
        await http.post(
          `${urlStock}/stock/${articuloId}/liberar`,
          { cantidad }
        );

        throw errInsert;
      }
    },
    async listarPedidos() {
      const pedidos = await repo.listar();
      return { status: 200, body: pedidos };
    }
  };
}

module.exports = { crearPedidosService };
