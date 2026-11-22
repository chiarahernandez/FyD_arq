const amqp = require("amqplib");

const EXCHANGE = "pedidos-events";
// Cola con nombre y durable (a diferencia de la anónima de catálogo): si este servicio
// está caído, los pedidos nuevos esperan en la cola y se registran cuando vuelve.
const COLA = "blockchain.pedidos";

async function consumirPedidosCreados(onPedidoCreado) {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  conn.on("error", (error) => console.error("Error de conexión con RabbitMQ:", error.message));
  conn.on("close", () => {
    console.error("Se cerró la conexión con RabbitMQ");
    process.exit(1);
  });

  const canal = await conn.createChannel();
  canal.on("error", (error) => console.error("Error en el canal de RabbitMQ:", error.message));
  canal.on("close", () => {
    console.error("Se cerró el canal de RabbitMQ");
    process.exit(1);
  });

  await canal.assertExchange(EXCHANGE, "fanout", { durable: true });
  await canal.assertQueue(COLA, { durable: true });
  await canal.bindQueue(COLA, EXCHANGE, "");
  await canal.prefetch(1); // de a un pedido: las tx salen en orden y sin choques de nonce

  await canal.consume(COLA, async (msg) => {
    if (!msg) return;
    let evento;
    try {
      evento = JSON.parse(msg.content.toString());
    } catch {
      console.error("Evento de pedido con JSON inválido, se descarta");
      return canal.nack(msg, false, false);
    }

    if (evento.tipo !== "pedido.creado") return canal.ack(msg);

    try {
      await onPedidoCreado(evento);
      canal.ack(msg);
    } catch (error) {
      console.error("Evento de pedido inválido, se descarta:", error.message);
      canal.nack(msg, false, false);
    }
  });

  console.log(`Blockchain consumiendo la cola ${COLA}`);
}

module.exports = { consumirPedidosCreados };
