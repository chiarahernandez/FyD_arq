// Tabla propia del servicio blockchain: estado de registro de cada pedido.
// No tiene FK a pedidos a propósito (cada servicio es dueño de sus tablas).
function crearRegistroRepository(pool) {
  return {
    async inicializar() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS registros_blockchain (
          pedido_id INT PRIMARY KEY,
          hash CHAR(66) NOT NULL,
          estado ENUM('pendiente','enviado','confirmado','fallido') NOT NULL DEFAULT 'pendiente',
          tx_hash CHAR(66) NULL,
          bloque BIGINT NULL,
          intentos INT NOT NULL DEFAULT 0,
          error VARCHAR(500) NULL,
          creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
          actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
    },

    async obtener(pedidoId) {
      const [rows] = await pool.query("SELECT * FROM registros_blockchain WHERE pedido_id = ?", [pedidoId]);
      return rows[0] ?? null;
    },

    async crearPendiente(pedidoId, hash) {
      await pool.query(
        "INSERT INTO registros_blockchain (pedido_id, hash, estado) VALUES (?, ?, 'pendiente')",
        [pedidoId, hash]
      );
    },

    async reiniciar(pedidoId, hash) {
      await pool.query(
        "UPDATE registros_blockchain SET hash = ?, estado = 'pendiente', error = NULL WHERE pedido_id = ?",
        [hash, pedidoId]
      );
    },

    async marcarEnviado(pedidoId, txHash) {
      await pool.query(
        `UPDATE registros_blockchain
         SET estado = 'enviado', tx_hash = ?, intentos = intentos + 1, error = NULL
         WHERE pedido_id = ?`,
        [txHash, pedidoId]
      );
    },

    async marcarConfirmado(pedidoId, { txHash = null, bloque = null } = {}) {
      await pool.query(
        `UPDATE registros_blockchain
         SET estado = 'confirmado', tx_hash = COALESCE(?, tx_hash), bloque = COALESCE(?, bloque), error = NULL
         WHERE pedido_id = ?`,
        [txHash, bloque, pedidoId]
      );
    },

    async marcarFallido(pedidoId, error) {
      await pool.query(
        "UPDATE registros_blockchain SET estado = 'fallido', error = ? WHERE pedido_id = ?",
        [String(error).slice(0, 500), pedidoId]
      );
    },
  };
}

module.exports = { crearRegistroRepository };
