const mongoose = require("mongoose");

async function conectar() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Conexión a MongoDB verificada");
}

module.exports = { conectar };
