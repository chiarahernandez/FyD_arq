
function crearPedidoRepository(pool) {
  return {
    async crear({
      usuarioId,
      nombreCliente,
      articuloId,
      cantidad,
      precioUnitario,
      importeTotal
    }) {
      const [result] = await pool.query(
        `INSERT INTO pedidos
         (usuario_id, nombre_cliente, articulo_id, cantidad, precio_historico, importe_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          usuarioId,
          nombreCliente,
          articuloId,
          cantidad,
          precioUnitario,
          importeTotal
        ]
      );

      return result.insertId;
    },

    async listar() {
      const [rows] = await pool.query(
        "SELECT * FROM pedidos ORDER BY id DESC"
      );
      return rows;
    }
  };
}

module.exports = { crearPedidoRepository };
