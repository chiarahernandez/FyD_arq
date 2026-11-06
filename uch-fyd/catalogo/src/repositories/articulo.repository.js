function crearArticuloRepository(pool) {
  return {
    async findAll() {
      const [rows] = await pool.query("SELECT id, nombre, precio, stock FROM articulos");
      return rows;
    },
    async findById(id) {
      const [rows] = await pool.query(
        "SELECT id, nombre, precio, stock FROM articulos WHERE id = ?",
        [id]
      );
      return rows[0] ?? null;
    },
    async findPrecioById(id) {
      const [rows] = await pool.query("SELECT precio FROM articulos WHERE id = ?", [id]);
      return rows[0]?.precio ?? null;
    },
    // PB-05: alta de artículos — hoy no existe
    async crear({ nombre, precio, stock }) {
      const [result] = await pool.query(
        "INSERT INTO articulos (nombre, precio, stock) VALUES (?, ?, ?)",
        [nombre, precio, stock]
      );
      return result.insertId;
    },
    // Contrato TP3: PATCH /catalogo/articulos/{id}/precio
    async actualizarPrecio(id, precio) {
      const [result] = await pool.query(
        "UPDATE articulos SET precio = ? WHERE id = ?",
        [precio, id]
      );
      return result.affectedRows > 0;
    },
  };
}

module.exports = { crearArticuloRepository };