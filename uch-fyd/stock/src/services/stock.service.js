function crearStockService(repo, canalEventos) {
  return {
    async obtenerDisponibilidad(articuloId) {
      return repo.getDisponibilidad(articuloId);
    },

    async reservar(articuloId, cantidad) {
      const reservado = await repo.reservar(articuloId, cantidad);
      if (reservado) {
        try {
          canalEventos.publish(
            "stock-events",
            "",
            Buffer.from(JSON.stringify({ articuloId, cantidad }))
          );
        } catch (error) {
          console.error("Reserva realizada, pero falló la publicación del evento:", error.message);
        }
      }
      return reservado;
    },

    async liberar(articuloId, cantidad) {
      return repo.liberar(articuloId, cantidad);
    },
  };
}

module.exports = { crearStockService };