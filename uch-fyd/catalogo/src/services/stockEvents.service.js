const amqp = require("amqplib");

async function suscribirseAEventosDeStock(repo) {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const canal = await conn.createChannel();
  await canal.assertExchange("stock-events", "fanout");
  const { queue } = await canal.assertQueue("", { exclusive: true });
  await canal.bindQueue(queue, "stock-events", "");

  await canal.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const { articuloId, cantidad } = JSON.parse(msg.content.toString());
      console.log(`Evento de stock recibido: artículo ${articuloId}, cantidad ${cantidad}`);
      canal.ack(msg);
    } catch (error) {
      console.error("Evento de stock inválido:", error.message);
      canal.nack(msg, false, false);
    }
  });

  console.log("Catálogo suscripto a stock-events");
}

module.exports = { suscribirseAEventosDeStock };
