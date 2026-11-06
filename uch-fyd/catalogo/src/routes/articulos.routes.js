const { Router } = require("express");

function crearArticulosRoutes(controller) {
  const router = Router();
  router.get("/articulos", controller.listar);
  router.post("/articulos", controller.crear);                     // PB-05
  router.get("/articulos/:id", controller.obtener);                // detalle completo (faltaba)
  router.get("/articulos/:id/precio", controller.obtenerPrecio);
  router.patch("/articulos/:id/precio", controller.actualizarPrecio); // contrato TP3
  return router;
}

module.exports = { crearArticulosRoutes };