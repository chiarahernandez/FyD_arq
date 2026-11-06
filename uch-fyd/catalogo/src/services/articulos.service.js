function crearArticulosService(repo) {
  return {
    listar: () => repo.findAll(),
    obtener: (id) => repo.findById(id),
    obtenerPrecio: (id) => repo.findPrecioById(id),
    crear: (datos) => repo.crear(datos),
    actualizarPrecio: (id, precio) => repo.actualizarPrecio(id, precio),
  };
}

module.exports = { crearArticulosService };