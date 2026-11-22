// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title RegistroPedidos
/// @notice Ancla en la blockchain el hash de cada pedido de UCH-FyD.
///         No guarda datos del pedido (la cadena es pública): solo un hash
///         keccak256 calculado por el servicio blockchain. Para verificar un
///         pedido se recalcula el hash con los datos de la base y se compara.
contract RegistroPedidos {
    struct Registro {
        bytes32 hash;
        uint64 fecha; // timestamp del bloque en que se registró
    }

    /// @notice Única cuenta autorizada a registrar (la wallet del servicio).
    address public immutable owner;

    mapping(uint256 => Registro) private registros;

    event PedidoRegistrado(uint256 indexed pedidoId, bytes32 hash, uint64 fecha);

    error NoAutorizado();
    error PedidoYaRegistrado(uint256 pedidoId);
    error HashVacio();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NoAutorizado();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Registra el hash de un pedido. Un pedido registrado no se puede
    ///         sobrescribir: eso es lo que da la garantía de inmutabilidad y,
    ///         de paso, hace idempotente el reintento de un mismo mensaje.
    function registrar(uint256 pedidoId, bytes32 hash) external onlyOwner {
        if (hash == bytes32(0)) revert HashVacio();
        if (registros[pedidoId].fecha != 0) revert PedidoYaRegistrado(pedidoId);

        uint64 ahora = uint64(block.timestamp);
        registros[pedidoId] = Registro(hash, ahora);
        emit PedidoRegistrado(pedidoId, hash, ahora);
    }

    /// @return hash  hash registrado (0x00… si no existe)
    /// @return fecha timestamp del registro (0 si no existe)
    function obtener(uint256 pedidoId) external view returns (bytes32 hash, uint64 fecha) {
        Registro memory r = registros[pedidoId];
        return (r.hash, r.fecha);
    }

    /// @notice true si el pedido está registrado y el hash coincide.
    function verificar(uint256 pedidoId, bytes32 hash) external view returns (bool) {
        Registro memory r = registros[pedidoId];
        return r.fecha != 0 && r.hash == hash;
    }
}
