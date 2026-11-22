const { calcularHash, normalizarPedido, desdeFilaPedido } = require("../utils/hashPedido");

const ESPERA_CONFIRMACION_MS = 180_000;
const REINTENTOS_MS = [0, 5_000, 15_000];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function crearBlockchainService({ repo, chain, obtenerPedido, etherscanBase }) {
  const { provider, contrato } = chain;

  // Todas las escrituras en la cadena pasan por esta cola: una transacción a la vez.
  // Hay una sola wallet, y mandar dos en paralelo puede chocar los nonces.
  let cola = Promise.resolve();
  function enCola(fn) {
    const resultado = cola.then(fn, fn);
    cola = resultado.catch(() => {});
    return resultado;
  }

  const urlTx = (txHash) => (txHash ? `${etherscanBase}/tx/${txHash}` : null);

  async function registrarUnaVez(datos) {
    const { pedidoId } = normalizarPedido(datos);
    const hash = calcularHash(datos);

    const registro = await repo.obtener(pedidoId);
    if (registro?.estado === "confirmado") return;

    if (!registro) {
      await repo.crearPendiente(pedidoId, hash);
    } else if (registro.estado === "enviado" && registro.tx_hash) {
      // Ya se había mandado una tx (p. ej. el servicio se reinició esperando): esperar esa.
      try {
        const receipt = await provider.waitForTransaction(registro.tx_hash, 1, ESPERA_CONFIRMACION_MS);
        if (receipt?.status === 1) {
          await repo.marcarConfirmado(pedidoId, { bloque: receipt.blockNumber });
          return;
        }
      } catch {
        // timeout o tx descartada: se sigue y se revisa la cadena
      }
    } else {
      await repo.reiniciar(pedidoId, hash);
    }

    // Si ya está en la cadena no se manda nada (el contrato igual lo rechazaría).
    const [, fecha] = await contrato.obtener(pedidoId);
    if (fecha !== 0n) {
      await repo.marcarConfirmado(pedidoId);
      return;
    }

    // Nonce explícito y fresco ("pending" incluye las tx todavía no minadas).
    const nonce = await provider.getTransactionCount(chain.wallet.address, "pending");
    const tx = await contrato.registrar(pedidoId, hash, { nonce });
    await repo.marcarEnviado(pedidoId, tx.hash);
    console.log(`Pedido ${pedidoId}: tx enviada ${tx.hash}`);

    const receipt = await tx.wait(1, ESPERA_CONFIRMACION_MS);
    await repo.marcarConfirmado(pedidoId, { txHash: tx.hash, bloque: receipt.blockNumber });
    console.log(`Pedido ${pedidoId}: confirmado en el bloque ${receipt.blockNumber}`);
  }

  // Registra con reintentos. Si los agota, deja el pedido como 'fallido' (se puede
  // reintentar con el endpoint). Solo lanza si los datos del pedido son inválidos.
  async function registrar(datos) {
    const { pedidoId } = normalizarPedido(datos);

    return enCola(async () => {
      let ultimoError;
      for (const espera of REINTENTOS_MS) {
        if (espera) await esperar(espera);
        try {
          await registrarUnaVez(datos);
          return;
        } catch (error) {
          ultimoError = error;
          console.error(`Pedido ${pedidoId}: error registrando en blockchain:`, error.shortMessage || error.message);
        }
      }
      try {
        await repo.marcarFallido(pedidoId, ultimoError.shortMessage || ultimoError.message);
      } catch (error) {
        console.error(`Pedido ${pedidoId}: no se pudo marcar como fallido:`, error.message);
      }
    });
  }

  async function obtenerEstado(pedidoId, { usuarioId, rol }) {
    const pedido = await obtenerPedido(pedidoId);
    if (!pedido) return { status: 404, body: { error: "pedido no encontrado" } };
    if (rol !== "admin" && String(pedido.usuario_id) !== String(usuarioId)) {
      return { status: 403, body: { error: "no podés consultar un pedido de otro usuario" } };
    }

    let registro = await repo.obtener(pedidoId);

    // Si quedó 'enviado' (p. ej. se cortó la espera), ver si la tx ya se minó.
    if (registro?.estado === "enviado" && registro.tx_hash) {
      const receipt = await provider.getTransactionReceipt(registro.tx_hash);
      if (receipt?.status === 1) {
        await repo.marcarConfirmado(pedidoId, { bloque: receipt.blockNumber });
        registro = await repo.obtener(pedidoId);
      }
    }

    // La fuente de verdad para "coincide" es la cadena, no nuestra tabla.
    const [hashRegistrado, fecha] = await contrato.obtener(pedidoId);
    const enCadena = fecha !== 0n;
    const hashActual = calcularHash(desdeFilaPedido(pedido));

    return {
      status: 200,
      body: {
        pedidoId,
        estado: registro?.estado ?? (enCadena ? "confirmado" : "no_registrado"),
        registradoEnBlockchain: enCadena,
        coincide: enCadena ? hashRegistrado === hashActual : null,
        hashRegistrado: enCadena ? hashRegistrado : null,
        hashActual,
        fechaRegistro: enCadena ? new Date(Number(fecha) * 1000).toISOString() : null,
        txHash: registro?.tx_hash ?? null,
        etherscanTxUrl: urlTx(registro?.tx_hash),
        bloque: registro?.bloque ?? null,
        error: registro?.estado === "fallido" ? registro.error : null,
        contrato: {
          direccion: chain.direccion,
          chainId: chain.chainId,
          etherscanUrl: `${etherscanBase}/address/${chain.direccion}`,
        },
      },
    };
  }

  // Reintento manual (admin) para pedidos 'fallido' o que nunca llegaron por la cola.
  // OJO: toma los datos actuales de la base; si ya fueron adulterados, se ancla lo adulterado.
  async function reintentar(pedidoId) {
    const pedido = await obtenerPedido(pedidoId);
    if (!pedido) return { status: 404, body: { error: "pedido no encontrado" } };

    const registro = await repo.obtener(pedidoId);
    if (registro?.estado === "confirmado") {
      return { status: 409, body: { error: "el pedido ya está registrado en blockchain" } };
    }

    registrar(desdeFilaPedido(pedido)).catch((error) =>
      console.error(`Pedido ${pedidoId}: reintento falló:`, error.message)
    );
    return { status: 202, body: { pedidoId, mensaje: "registro en blockchain encolado" } };
  }

  return { registrar, obtenerEstado, reintentar };
}

module.exports = { crearBlockchainService };
