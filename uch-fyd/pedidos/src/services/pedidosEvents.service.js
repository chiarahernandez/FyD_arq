const amqp = require("amqplib");

const EXCHANGE = "pedidos-events";
const TIMEOUT_CONFIRMACION_MS = 5_000;

// Publicador de eventos de pedidos. Es "best effort" A PROPÓSITO: si RabbitMQ no
// está disponible, el pedido se crea igual y solo se loguea el error. Crear pedidos
// nunca depende de la blockchain (el registro faltante se puede reintentar después).
function crearPublicadorEventos(url = process.env.RABBITMQ_URL) {
  let canalPromesa = null;

  function obtenerCanal() {
    if (!canalPromesa) {
      canalPromesa = (async () => {
        const conn = await amqp.connect(url);
        conn.on("error", (error) => console.error("Error de conexión con RabbitMQ:", error.message));
        conn.on("close", () => {
          canalPromesa = null; // se reconecta en la próxima publicación
        });

        const canal = await conn.createConfirmChannel();
        canal.on("error", (error) => console.error("Error en el canal de RabbitMQ:", error.message));
        canal.on("close", () => {
          canalPromesa = null;
        });

        await canal.assertExchange(EXCHANGE, "fanout", { durable: true });
        return canal;
      })().catch((error) => {
        canalPromesa = null;
        throw error;
      });
    }
    return canalPromesa;
  }

  return {
    async conectar() {
      if (!url) return console.warn("RABBITMQ_URL no definida: no se publicarán eventos de pedidos");
      try {
        await obtenerCanal();
        console.log("Conexión a RabbitMQ verificada (pedidos-events)");
      } catch (error) {
        console.error("RabbitMQ no disponible por ahora, se reintenta al publicar:", error.message);
      }
    },

    // Nunca lanza.
    async publicarPedidoCreado(pedido) {
      if (!url) return;
      try {
        const canal = await obtenerCanal();
        const evento = { tipo: "pedido.creado", ...pedido, publicadoEn: new Date().toISOString() };
        canal.publish(EXCHANGE, "", Buffer.from(JSON.stringify(evento)), {
          persistent: true,
          contentType: "application/json",
        });
        await Promise.race([
          canal.waitForConfirms(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout de confirmación")), TIMEOUT_CONFIRMACION_MS)),
        ]);
      } catch (error) {
        console.error(`No se pudo publicar el evento del pedido ${pedido.pedidoId}:`, error.message);
      }
    },
  };
}

module.exports = { crearPublicadorEventos };
