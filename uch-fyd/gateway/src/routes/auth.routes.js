const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = createProxyMiddleware({
  target: "http://auth:3001",
  changeOrigin: true,
  on: {
    error(error, _req, res) {
      console.error("Error al comunicarse con Auth:", error.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "servicio de autenticación no disponible" });
      }
    },
  },
});
