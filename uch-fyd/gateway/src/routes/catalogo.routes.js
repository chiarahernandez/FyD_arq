const { createProxyMiddleware } = require("http-proxy-middleware");

function crearCatalogoProxy(resolverInstancia) {
  return async function proxyCatalogo(req, res, next) {
    let target;
    try {
      target = await resolverInstancia("catalogo");
    } catch (error) {
      console.error("No se pudo resolver el servicio de Catálogo:", error.message);
      return res.status(503).json({ error: "servicio de catálogo no disponible" });
    }

    createProxyMiddleware({
      target,
      changeOrigin: true,
      on: {
        error(error, _req, proxyRes) {
          console.error("Error al comunicarse con Catálogo:", error.message);
          if (!proxyRes.headersSent) {
            proxyRes.status(502).json({ error: "servicio de catálogo no disponible" });
          }
        },
      },
    })(req, res, next);
  };
}

module.exports = { crearCatalogoProxy };