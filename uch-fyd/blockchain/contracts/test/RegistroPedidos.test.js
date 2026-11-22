const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("RegistroPedidos", () => {
  async function desplegar() {
    const [owner, otro] = await ethers.getSigners();
    const contrato = await ethers.deployContract("RegistroPedidos");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("pedido-1"));
    return { contrato, owner, otro, hash };
  }

  it("el deployer queda como owner", async () => {
    const { contrato, owner } = await loadFixture(desplegar);
    expect(await contrato.owner()).to.equal(owner.address);
  });

  it("registra un pedido y emite el evento", async () => {
    const { contrato, hash } = await loadFixture(desplegar);
    await expect(contrato.registrar(1, hash)).to.emit(contrato, "PedidoRegistrado");

    const [h, fecha] = await contrato.obtener(1);
    expect(h).to.equal(hash);
    expect(fecha).to.be.greaterThan(0n);
  });

  it("verificar distingue hash correcto de adulterado", async () => {
    const { contrato, hash } = await loadFixture(desplegar);
    await contrato.registrar(1, hash);
    const adulterado = ethers.keccak256(ethers.toUtf8Bytes("pedido-1-modificado"));

    expect(await contrato.verificar(1, hash)).to.equal(true);
    expect(await contrato.verificar(1, adulterado)).to.equal(false);
    expect(await contrato.verificar(2, hash)).to.equal(false);
  });

  it("no permite sobrescribir un pedido ya registrado", async () => {
    const { contrato, hash } = await loadFixture(desplegar);
    await contrato.registrar(1, hash);
    const otroHash = ethers.keccak256(ethers.toUtf8Bytes("otro"));

    await expect(contrato.registrar(1, otroHash))
      .to.be.revertedWithCustomError(contrato, "PedidoYaRegistrado")
      .withArgs(1);
  });

  it("solo el owner puede registrar", async () => {
    const { contrato, otro, hash } = await loadFixture(desplegar);
    await expect(contrato.connect(otro).registrar(1, hash)).to.be.revertedWithCustomError(
      contrato,
      "NoAutorizado"
    );
  });

  it("rechaza hash vacío", async () => {
    const { contrato } = await loadFixture(desplegar);
    await expect(contrato.registrar(1, ethers.ZeroHash)).to.be.revertedWithCustomError(
      contrato,
      "HashVacio"
    );
  });

  it("un pedido no registrado devuelve ceros", async () => {
    const { contrato } = await loadFixture(desplegar);
    const [h, fecha] = await contrato.obtener(99);
    expect(h).to.equal(ethers.ZeroHash);
    expect(fecha).to.equal(0n);
  });
});
