const { createProxyMiddleware } = require("http-proxy-middleware");

function crearPedidosProxy(resolverInstancia) {
  return async function proxyPedidos(req, res, next) {
    let target;
    try {
      target = await resolverInstancia("pedidos");
    } catch (error) {
      console.error("No se pudo resolver el servicio de Pedidos:", error.message);
      return res.status(503).json({ error: "servicio de pedidos no disponible" });
    }

    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { "^/(.*)$": "/pedidos/$1" },
      on: {
        error(error, _req, proxyRes) {
          console.error("Error al comunicarse con Pedidos:", error.message);
          if (!proxyRes.headersSent) {
            proxyRes.status(502).json({ error: "servicio de pedidos no disponible" });
          }
        },
      },
    })(req, res, next);
  };
}

module.exports = { crearPedidosProxy };