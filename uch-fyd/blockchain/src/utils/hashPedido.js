const { keccak256, toUtf8Bytes } = require("ethers");

// El hash se calcula SIEMPRE con esta función, tanto al registrar como al verificar.
// Se serializa un objeto con orden de claves y formato fijos, porque cualquier
// diferencia (1500 vs "1500.00", número vs string) daría otro hash.
// No se incluye la fecha del pedido: DATETIME + zonas horarias generan diferencias falsas.
function normalizarPedido({ pedidoId, usuarioId, articuloId, cantidad, precioUnitario, importeTotal }) {
  const p = {
    pedidoId: Number(pedidoId),
    usuarioId: String(usuarioId ?? ""),
    articuloId: Number(articuloId),
    cantidad: Number(cantidad),
    precioUnitario: Number(precioUnitario).toFixed(2),
    importeTotal: Number(importeTotal).toFixed(2),
  };

  if (!Number.isInteger(p.pedidoId) || p.pedidoId <= 0) throw new Error("pedidoId inválido");
  if (!p.usuarioId) throw new Error("usuarioId vacío");
  if (!Number.isInteger(p.articuloId) || !Number.isInteger(p.cantidad)) {
    throw new Error("articuloId/cantidad inválidos");
  }
  if (p.precioUnitario === "NaN" || p.importeTotal === "NaN") throw new Error("importes inválidos");

  return p;
}

// Convierte una fila de la tabla pedidos (snake_case, DECIMAL como string) al formato del evento.
function desdeFilaPedido(fila) {
  return {
    pedidoId: fila.id,
    usuarioId: fila.usuario_id,
    articuloId: fila.articulo_id,
    cantidad: fila.cantidad,
    precioUnitario: fila.precio_historico,
    importeTotal: fila.importe_total,
  };
}

function calcularHash(pedido) {
  return keccak256(toUtf8Bytes(JSON.stringify(normalizarPedido(pedido))));
}

module.exports = { calcularHash, normalizarPedido, desdeFilaPedido };
