async function login({ email, password }, { repo, bcrypt, jwt, jwtSecret }) {
  const u = await repo.findByEmail(email);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    return { status: 401, body: { error: "credenciales inválidas" } };
  }
  if (!u.activo) {
    return { status: 403, body: { error: "la cuenta todavía no fue activada" } };
  }
  const token = jwt.sign({ sub: u._id, email }, jwtSecret, { expiresIn: "2h" });
  return { status: 200, body: { token } };
}

module.exports = { login };