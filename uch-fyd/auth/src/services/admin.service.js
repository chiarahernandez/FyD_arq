async function activarUsuario(id, repo) {
  const actualizado = await repo.activar(id);
  if (!actualizado) throw Object.assign(new Error("no encontrado"), { status: 404 });
  return true;
}

async function cambiarRolUsuario(id, rol, repo) {
  if (!["cliente", "admin"].includes(rol)) {
    throw Object.assign(new Error("rol inválido"), { status: 400 });
  }
  const actualizado = await repo.cambiarRol(id, rol);
  if (!actualizado) throw Object.assign(new Error("no encontrado"), { status: 404 });
  return true;
}

module.exports = { activarUsuario, cambiarRolUsuario };
