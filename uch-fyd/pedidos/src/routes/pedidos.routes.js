
const { Router } = require("express");

function crearPedidosRoutes(controller) {
  const router = Router();

  // Endpoint para crear un pedido
  router.post("/pedidos", controller.crear);
  router.get("/pedidos", controller.listar);

  // Uso interno entre servicios (lo llama Blockchain para verificar el hash).
  // El Gateway no la expone: solo reenvía rutas bajo /pedidos.
  router.get("/internal/pedidos/:id", controller.obtener);

  return router;
}

module.exports = { crearPedidosRoutes };
