module.exports = function errorHandler(error, req, res, next) {
  console.error("Error:", error.code, error.message);
  res.status(500).json({ error: "No se pudo completar la operación" });
};