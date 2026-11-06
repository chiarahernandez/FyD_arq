
function crearPedidoRepository(pool) {
  return {
    async crear({
      usuarioId,
      articuloId,
      cantidad,
      precioUnitario,
      importeTotal
    }) {
      const [result] = await pool.query(
        `INSERT INTO pedidos
         (usuario_id, articulo_id, cantidad, precio_historico, importe_total)
         VALUES (?, ?, ?, ?, ?)`,
        [
          usuarioId,
          articuloId,
          cantidad,
          precioUnitario,
          importeTotal
        ]
      );

      return result.insertId;
    }
  };
}

module.exports = { crearPedidoRepository };
