const { Router } = require("express");

function crearAuthRoutes(controller) {
  const router = Router();
  router.post("/registro", controller.registrar);
  router.post("/login", controller.login);
  router.patch("/usuarios/:id/activar", controller.activar);
  router.patch("/usuarios/:id/rol", controller.cambiarRol); // Fase 1.11 — protegida en el Gateway (requireAdmin)
  return router;
}

module.exports = { crearAuthRoutes };
