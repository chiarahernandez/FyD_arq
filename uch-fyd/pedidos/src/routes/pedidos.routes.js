
const { Router } = require("express");

function crearPedidosRoutes(controller) {
  const router = Router();

  // Endpoint para crear un pedido
  router.post("/pedidos", controller.crear);
  router.get("/pedidos", controller.listar);

  return router;
}

module.exports = { crearPedidosRoutes };
