
const Consul = require("consul");

function registrarServicio({ nombre, puerto }) {
  const consul = new Consul({
    host: process.env.CONSUL_HOST
  });

  consul.agent.service.register(
    {
      name: nombre,
      address: nombre,
      port: puerto,
      check: {
        http: `http://${nombre}:${puerto}/health`,
        interval: "10s",
        timeout: "5s",
        deregistercriticalserviceafter: "30s"
      }
    },
    (error) => {
      if (error) {
        console.error(
          `Error al registrar ${nombre} en Consul:`,
          error.message
        );
        return;
      }

      console.log(
        `${nombre} registrado en Consul con healthcheck`
      );
    }
  );

  return consul;
}

module.exports = { registrarServicio };
