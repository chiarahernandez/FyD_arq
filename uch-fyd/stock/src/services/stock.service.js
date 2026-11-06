function crearStockService(repo) {
  return {
    async obtenerDisponibilidad(articuloId) {
      return repo.getDisponibilidad(articuloId);
    },

    async reservar(articuloId, cantidad) {
      return repo.reservar(articuloId, cantidad);
    },

    async liberar(articuloId, cantidad) {
      return repo.liberar(articuloId, cantidad);
    },
  };
}

module.exports = { crearStockService };