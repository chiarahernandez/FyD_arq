function crearArticulosController(service) {
  return {
    async listar(req, res, next) {
      try {
        res.json(await service.listar());
      } catch (e) { next(e); }
    },
    async obtener(req, res, next) {
      try {
        const articulo = await service.obtener(req.params.id);
        if (!articulo) return res.sendStatus(404);
        res.json(articulo);
      } catch (e) { next(e); }
    },
    async obtenerPrecio(req, res, next) {
      try {
        const precio = await service.obtenerPrecio(req.params.id);
        if (precio === null) return res.sendStatus(404);
        res.json({ precio });
      } catch (e) { next(e); }
    },
    // PB-05
    async crear(req, res, next) {
      try {
        const { nombre, precio, stock } = req.body;
        if (!nombre || precio == null || stock == null) {
          return res.status(400).json({ error: "nombre, precio y stock son obligatorios" });
        }
        const id = await service.crear({ nombre, precio, stock });
        res.status(201).json({ id });
      } catch (e) { next(e); }
    },
    // Contrato TP3: uso administrativo
    async actualizarPrecio(req, res, next) {
      try {
        const { precio } = req.body;
        if (precio == null) return res.status(400).json({ error: "precio es obligatorio" });
        const actualizado = await service.actualizarPrecio(req.params.id, precio);
        if (!actualizado) return res.sendStatus(404);
        res.sendStatus(200);
      } catch (e) { next(e); }
    },
  };
}

module.exports = { crearArticulosController };