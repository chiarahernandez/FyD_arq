async function activarUsuario(id, repo) {
  const actualizado = await repo.activar(id);
  if (!actualizado) throw Object.assign(new Error("no encontrado"), { status: 404 });
  return true;
}

module.exports = { activarUsuario }; 