const { Router } = require("express");

function crearStockRoutes(controller) {
  const router = Router();

  router.get(
    "/stock/:articuloId",
    controller.obtenerDisponibilidad
  );

  router.post(
    "/stock/reservar",
    controller.reservar
  );

  router.post(
    "/stock/:articuloId/liberar",
    controller.liberar
  );

  return router;
}

module.exports = { crearStockRoutes };
