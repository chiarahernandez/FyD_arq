function crearStockRepository(pool) {
  return {
    async getDisponibilidad(articuloId) {
      const [rows] = await pool.query("SELECT stock FROM articulos WHERE id = ?", [articuloId]);
      return rows[0]?.stock ?? null;
    },
    async reservar(articuloId, cantidad) {
      const [result] = await pool.query(
        "UPDATE articulos SET stock = stock - ? WHERE id = ? AND stock >= ?",
        [cantidad, articuloId, cantidad]
      );
      return result.affectedRows > 0;
    },
    async liberar(articuloId, cantidad) {
      const [result] = await pool.query(
        "UPDATE articulos SET stock = stock + ? WHERE id = ?",
        [cantidad, articuloId]
      );
      return result.affectedRows > 0;
    },
  };
}

module.exports = { crearStockRepository };