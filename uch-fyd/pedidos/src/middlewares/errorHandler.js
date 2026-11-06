
module.exports = function errorHandler(error, req, res, next) {
  console.error("Error:", error.code, error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "No se pudo completar la operación"
  });
};
