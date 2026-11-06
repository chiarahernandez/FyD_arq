
const { Router } = require("express");

function crearPedidosRoutes(controller) {
  const router = Router();

  // Endpoint para crear un pedido
  router.post("/pedidos", controller.crear);

  return router;
}

module.exports = { crearPedidosRoutes };
