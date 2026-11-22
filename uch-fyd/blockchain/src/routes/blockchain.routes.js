const { Router } = require("express");

function crearBlockchainRoutes(controller) {
  const router = Router();
  router.get("/blockchain/pedidos/:id", controller.estado);
  router.post("/blockchain/pedidos/:id/reintentar", controller.reintentar); // solo admin (Gateway)
  return router;
}

module.exports = { crearBlockchainRoutes };
