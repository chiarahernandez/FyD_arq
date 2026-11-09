const jwt = require("jsonwebtoken");

function validarJWT(req, res, next) {
  const auth = req.headers.authorization;
  const tokenMatch = auth && auth.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return res.sendStatus(401);

  try {
    req.usuario = jwt.verify(tokenMatch[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.sendStatus(401);
  }
}

module.exports = validarJWT;