const amqp = require("amqplib");

async function publicarEventosDeStock() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);

  conn.on("error", (error) => {
    console.error("Error de conexión con RabbitMQ:", error.message);
  });

  conn.on("close", () => {
    console.error("Se cerró la conexión con RabbitMQ");
    process.exit(1);
  });

  const canal = await conn.createChannel();

  canal.on("error", (error) => {
    console.error("Error en el canal de RabbitMQ:", error.message);
  });

  canal.on("close", () => {
    console.error("Se cerró el canal de RabbitMQ");
    process.exit(1);
  });

  await canal.assertExchange("stock-events", "fanout");
  console.log("Conexión a RabbitMQ verificada");

  return canal;
}

module.exports = { publicarEventosDeStock };
