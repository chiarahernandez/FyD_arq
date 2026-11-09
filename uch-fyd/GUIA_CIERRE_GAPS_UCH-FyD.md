# Guía paso a paso — Cierre de gaps UCH-FyD

Basado en la auditoría del repo `chiarahernandez/FyD_arq` (rama `main`, commit `940360e`) contra el documento `TP_Principal_-_Grupo_3_3.pdf`. Cubre: la regresión operativa que reaparecio, el refactor a capas (DAO/Repository, ADR-03), los ítems del backlog que faltan y los contratos de servicio que no coinciden con el TP3.

**Orden recomendado:** primero lo que bloquea levantar el entorno (Fase 0), después la reestructuración en capas porque todo lo demás se construye arriba de eso (Fase 1), recién ahí los gaps funcionales (Fase 2), y al final lo que no bloquea nada pero el profesor va a mirar (Fases 3-5).

---

## Fase 0 — Arreglos urgentes (bloquean el entorno)

### 0.1 Healthcheck de RabbitMQ (regresión)

El fix que habíamos aplicado se perdió en un merge. Sin esto, `catalogo` y `stock` pueden volver a crashear al arrancar porque Docker los deja arrancar antes de que RabbitMQ termine de levantar.

En `uch-fyd/docker-compose.yml`, el bloque `rabbitmq` debe quedar así:

```yaml
rabbitmq:
  image: rabbitmq:3-management
  ports: ["5672:5672", "15672:15672"]
  healthcheck:
    test: ["CMD", "rabbitmq-diagnostics", "-q", "check_port_connectivity"]
    interval: 5s
    timeout: 5s
    retries: 15
    start_period: 10s
```

Y en `catalogo` y `stock`, el `depends_on` tiene que esperar a que esté sano, no solo iniciado:

```yaml
depends_on:
  rabbitmq: { condition: service_healthy }
  consul: { condition: service_started }
```

### 0.2 CORS en el Gateway

Si todavía no está aplicado, en `uch-fyd/gateway/src/index.js`:

```bash
cd gateway
npm install cors
```

```js
const cors = require("cors");
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

Esta línea tiene que ir **antes** de los `app.use("/auth", ...)`, `app.use("/pedidos", ...)`, etc.

---

## Fase 1 — Reestructurar en capas (DAO/Repository, ADR-03)

Hoy el SQL vive directo en los handlers de Express. Vamos a separar en: `routes` → `controllers` → `services` → `repositories`. Regla de oro: **el SQL no sale de `repositories/`**.

### 1.1 Estructura de carpetas (crear en cada uno de `catalogo/`, `stock/`, `pedidos/`)

```
src/
├── index.js
├── config/
│   ├── db.js
│   └── consul.js
├── routes/
├── controllers/
├── services/
├── repositories/
├── dto/
└── middlewares/
    └── errorHandler.js
```

### 1.2 `config/db.js` (igual en catalogo, stock, pedidos)

```js
const mysql = require("mysql2/promise");
const fs = require("node:fs");

function crearPool() {
  const port = Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT debe contener un puerto válido");
  }
  return mysql.createPool({
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
      ca: fs.readFileSync(process.env.DB_CA_PATH, "utf8"),
      rejectUnauthorized: true,
      verifyIdentity: true,
    },
  });
}

module.exports = { crearPool };
```

### 1.3 `config/consul.js` (con healthcheck — ver también Fase 3)

```js
const Consul = require("consul");

function registrarServicio({ nombre, puerto }) {
  const consul = new Consul({ host: process.env.CONSUL_HOST });
  consul.agent.service.register(
    {
      name: nombre,
      address: nombre,
      port: puerto,
      check: {
        http: `http://${nombre}:${puerto}/health`,
        interval: "10s",
        timeout: "5s",
        deregistercriticalserviceafter: "30s",
      },
    },
    (error) => {
      if (error) {
        console.error(`Error al registrar ${nombre} en Consul:`, error.message);
        return;
      }
      console.log(`${nombre} registrado en Consul con healthcheck`);
    }
  );
  return consul;
}

module.exports = { registrarServicio };
```

### 1.4 `middlewares/errorHandler.js`

```js
module.exports = function errorHandler(error, req, res, next) {
  console.error("Error:", error.code, error.message);
  res.status(500).json({ error: "No se pudo completar la operación" });
};
```

### 1.5 Servicio `catalogo/`

**`repositories/articulo.repository.js`**
```js
function crearArticuloRepository(pool) {
  return {
    async findAll() {
      const [rows] = await pool.query("SELECT id, nombre, precio, stock FROM articulos");
      return rows;
    },
    async findById(id) {
      const [rows] = await pool.query(
        "SELECT id, nombre, precio, stock FROM articulos WHERE id = ?",
        [id]
      );
      return rows[0] ?? null;
    },
    async findPrecioById(id) {
      const [rows] = await pool.query("SELECT precio FROM articulos WHERE id = ?", [id]);
      return rows[0]?.precio ?? null;
    },
    // PB-05: alta de artículos — hoy no existe
    async crear({ nombre, precio, stock }) {
      const [result] = await pool.query(
        "INSERT INTO articulos (nombre, precio, stock) VALUES (?, ?, ?)",
        [nombre, precio, stock]
      );
      return result.insertId;
    },
    // Contrato TP3: PATCH /catalogo/articulos/{id}/precio
    async actualizarPrecio(id, precio) {
      const [result] = await pool.query(
        "UPDATE articulos SET precio = ? WHERE id = ?",
        [precio, id]
      );
      return result.affectedRows > 0;
    },
  };
}

module.exports = { crearArticuloRepository };
```

**`services/articulos.service.js`**
```js
function crearArticulosService(repo) {
  return {
    listar: () => repo.findAll(),
    obtener: (id) => repo.findById(id),
    obtenerPrecio: (id) => repo.findPrecioById(id),
    crear: (datos) => repo.crear(datos),
    actualizarPrecio: (id, precio) => repo.actualizarPrecio(id, precio),
  };
}

module.exports = { crearArticulosService };
```

**`controllers/articulos.controller.js`**
```js
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
```

**`routes/articulos.routes.js`**
```js
const { Router } = require("express");

function crearArticulosRoutes(controller) {
  const router = Router();
  router.get("/articulos", controller.listar);
  router.post("/articulos", controller.crear);                     // PB-05
  router.get("/articulos/:id", controller.obtener);                // detalle completo (faltaba)
  router.get("/articulos/:id/precio", controller.obtenerPrecio);
  router.patch("/articulos/:id/precio", controller.actualizarPrecio); // contrato TP3
  return router;
}

module.exports = { crearArticulosRoutes };
```

**`index.js` (queda chico, solo bootstrap)**
```js
const express = require("express");
const { crearPool } = require("./config/db");
const { registrarServicio } = require("./config/consul");
const { crearArticuloRepository } = require("./repositories/articulo.repository");
const { crearArticulosService } = require("./services/articulos.service");
const { crearArticulosController } = require("./controllers/articulos.controller");
const { crearArticulosRoutes } = require("./routes/articulos.routes");
const { suscribirseAEventosDeStock } = require("./services/stockEvents.service");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.use(express.json());

async function iniciar() {
  const pool = crearPool();
  await pool.query("SELECT 1");
  console.log("Conexión a MySQL en Aiven verificada");

  const repo = crearArticuloRepository(pool);
  const service = crearArticulosService(repo);
  const controller = crearArticulosController(service);

  app.use(crearArticulosRoutes(controller));
  app.get("/health", (_, res) => res.sendStatus(200));
  app.use(errorHandler);

  await suscribirseAEventosDeStock(repo); // Fase 4

  app.listen(3002, () => {
    console.log("Catálogo escuchando en el puerto 3002");
    registrarServicio({ nombre: "catalogo", puerto: 3002 });
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar Catálogo:", error.message);
  process.exit(1);
});
```

### 1.6 Servicio `stock/`

**`repositories/stock.repository.js`**
```js
function crearStockRepository(pool) {
  return {
    async getDisponibilidad(articuloId) {
      const [rows] = await pool.query("SELECT stock FROM articulos WHERE id = ?", [articuloId]);
      return rows[0]?.stock ?? null;
    },
    async reservar(articuloId, cantidad) {
      const [result] = await pool.query(
        "UPDATE articulos SET stock = stock - ? WHERE id = ? AND stock >= ?",
        [cantidad, articuloId, cantidad]
      );
      return result.affectedRows > 0;
    },
    async liberar(articuloId, cantidad) {
      const [result] = await pool.query(
        "UPDATE articulos SET stock = stock + ? WHERE id = ?",
        [cantidad, articuloId]
      );
      return result.affectedRows > 0;
    },
  };
}

module.exports = { crearStockRepository };
```

El resto (`services/stock.service.js`, `controllers/stock.controller.js`, `routes/stock.routes.js`) sigue el mismo molde que `catalogo`. Rutas a agregar:

```js
router.get("/stock/:articuloId", controller.obtenerDisponibilidad); // faltaba en el contrato
router.post("/stock/reservar", controller.reservar);
router.post("/stock/:articuloId/liberar", controller.liberar);
```

### 1.7 Servicio `pedidos/`

**`repositories/pedido.repository.js`**
```js
function crearPedidoRepository(pool) {
  return {
    async crear({ usuarioId, articuloId, cantidad, precioUnitario, importeTotal }) {
      const [result] = await pool.query(
        `INSERT INTO pedidos (usuario_id, articulo_id, cantidad, precio_historico, importe_total)
         VALUES (?, ?, ?, ?, ?)`,
        [usuarioId, articuloId, cantidad, precioUnitario, importeTotal]
      );
      return result.insertId;
    },
  };
}

module.exports = { crearPedidoRepository };
```

**`services/pedidos.service.js`** — acá va la orquestación y el cálculo que falta (PB-09):
```js
function crearPedidosService({ repo, resolverInstancia, http }) {
  return {
    async crearPedido({ usuarioId, articuloId, cantidad }) {
      const urlPool = await resolverInstancia("pool");
      const resPool = await http.post(`${urlPool}/pool/ejecutar`, {
        tareaId: `${usuarioId}-${Date.now()}`,
      });
      if (resPool.data.estado !== "aceptada") {
        return { status: 503, body: { error: "sistema temporalmente ocupado" } };
      }

      const urlCatalogo = await resolverInstancia("catalogo");
      const { data: { precio } } = await http.get(`${urlCatalogo}/articulos/${articuloId}/precio`);

      const urlStock = await resolverInstancia("stock");
      const resStock = await http.post(
        `${urlStock}/stock/reservar`,
        { articuloId, cantidad },
        { validateStatus: () => true }
      );
      if (resStock.status === 409) {
        return { status: 409, body: { error: "stock insuficiente" } };
      }

      // PB-09: cálculo del importe total — antes no existía
      const importeTotal = Number((precio * cantidad).toFixed(2));

      try {
        const pedidoId = await repo.crear({
          usuarioId, articuloId, cantidad, precioUnitario: precio, importeTotal,
        });
        return { status: 201, body: { pedidoId, precioUnitario: precio, importeTotal } };
      } catch (errInsert) {
        await http.post(`${urlStock}/stock/${articuloId}/liberar`, { cantidad }); // compensación
        throw errInsert;
      }
    },
  };
}

module.exports = { crearPedidosService };
```

**Migración de base de datos** (PB-08/PB-09 — falta la columna `importe_total`):
```sql
ALTER TABLE pedidos ADD COLUMN importe_total DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER precio_historico;
```

`controllers/pedidos.controller.js` y `routes/pedidos.routes.js` siguen el mismo molde: el controller solo valida el `req.body` y llama a `service.crearPedido(...)`.

### 1.8 Servicio `auth/` (Mongo en vez de SQL)

```
src/
├── index.js
├── config/{db.js, consul.js}
├── models/usuario.model.js
├── routes/auth.routes.js
├── controllers/auth.controller.js
├── services/{auth.service.js, admin.service.js}
└── repositories/usuario.repository.js
```

Ver Fase 2 para el contenido concreto de `auth` — ahí es donde están los gaps más importantes (PB-02, PB-03, PB-04).

### 1.9 `gateway/`

No necesita repositorio ni service (no toca base de datos). Alcanza con mover la validación de JWT a `middlewares/validarJWT.js` y separar un archivo de rutas por servicio destino (`routes/auth.routes.js`, `routes/catalogo.routes.js`, `routes/pedidos.routes.js`) en vez de tenerlo todo en un `index.js` plano.

---

## Fase 2 — Cerrar los gaps funcionales del backlog

### 2.1 PB-02 — usuario inactivo por default

En `auth/src/models/usuario.model.js`:
```js
const mongoose = require("mongoose");

const Usuario = mongoose.model("Usuario", {
  email: { type: String, required: true, unique: true }, // unique habilita el 409 (ver 2.7)
  nombre: { type: String },                                // PB-01: faltaba
  passwordHash: String,
  activo: { type: Boolean, default: false },                // antes: true (al revés de lo pedido)
});

module.exports = Usuario;
```

### 2.2 PB-03 — login debe respetar el estado de la cuenta

En `auth/src/services/auth.service.js`:
```js
async function login({ email, password }, { repo, bcrypt, jwt, jwtSecret }) {
  const u = await repo.findByEmail(email);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    return { status: 401, body: { error: "credenciales inválidas" } };
  }
  if (!u.activo) {
    return { status: 403, body: { error: "la cuenta todavía no fue activada" } };
  }
  const token = jwt.sign({ sub: u._id, email }, jwtSecret, { expiresIn: "2h" });
  return { status: 200, body: { token } };
}

module.exports = { login };
```

### 2.3 PB-04 — activación de usuarios por admin (endpoint nuevo)

`auth/src/services/admin.service.js`:
```js
async function activarUsuario(id, repo) {
  const actualizado = await repo.activar(id);
  if (!actualizado) throw Object.assign(new Error("no encontrado"), { status: 404 });
  return true;
}

module.exports = { activarUsuario };
```

`auth/src/repositories/usuario.repository.js` necesita el método `activar`:
```js
async activar(id) {
  const res = await Usuario.updateOne({ _id: id }, { activo: true });
  return res.matchedCount > 0;
}
```

Ruta nueva en `auth/src/routes/auth.routes.js`:
```js
router.patch("/usuarios/:id/activar", adminController.activar);
```

> Importante: esta ruta debería protegerse con algún chequeo de rol admin. Si todavía no manejan roles, como mínimo agreguen una validación simple (header con una clave de admin, o un claim `rol` en el JWT) antes de habilitarla en producción — tal cual está, cualquiera con un token válido podría activar usuarios.

### 2.4 PB-01/PB-08 — falta el nombre en el registro

`POST /registro` tiene que aceptar y guardar `nombre`:
```js
async function registrar({ email, password, nombre }, { repo, bcrypt }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const id = await repo.crear({ email, nombre, passwordHash });
  return id;
}
```

### 2.5 PB-09 — importe total

Ya resuelto en la Fase 1.7 (`services/pedidos.service.js` + columna `importe_total`).

### 2.6 Contrato TP3 — `POST /auth/registro` debe devolver 409 si el email ya existe

Con el `unique: true` del paso 2.1, Mongo tira un error `code 11000` en duplicados. Hay que atraparlo:
```js
async function registrar(req, res, next) {
  try {
    const id = await authService.registrar(req.body);
    res.status(201).json({ id });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "ese email ya está registrado" });
    }
    next(error);
  }
}
```

---

## Fase 3 — Service Registry: healthchecks faltantes

Hoy solo `auth` registra un `check` en Consul; `catalogo`, `stock`, `pedidos` y `pool` se registran sin healthcheck, así que `resolverInstancia()` (que filtra por `passing: true`) no tiene nada que evaluar para ellos.

Ya quedó resuelto en el paso 1.3 (`config/consul.js`) para los servicios Node — hay que llamarlo así en cada `index.js`:
```js
registrarServicio({ nombre: "catalogo", puerto: 3002 });
```

Para `pool/` (Java/Spring), en `ConsulRegistration.java` agregar el bloque de `Check` al registrar el servicio (la librería cliente de Consul para Java expone `Registration.RegCheck.http(url, intervalSeconds)` — revisen la versión del cliente que están usando, la forma exacta cambia un poco entre versiones).

---

## Fase 4 — Mensajería: que Catálogo use el evento de verdad

Hoy `catalogo` solo hace `console.log` del evento de Stock. El documento describe que debería mantener "una bandera de disponibilidad que se muestra al listar o consultar artículos" (nunca para decidir si una compra se confirma, solo para que el listado se vea actualizado).

`catalogo/src/services/stockEvents.service.js`:
```js
const amqp = require("amqplib");

async function suscribirseAEventosDeStock(repo) {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange("stock-events", "fanout");
  const { queue } = await ch.assertQueue("", { exclusive: true });
  await ch.bindQueue(queue, "stock-events", "");

  await ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const { articuloId, cantidad } = JSON.parse(msg.content.toString());
      // actualiza el modelo de lectura propio de Catálogo — no decide si una compra se confirma
      await repo.marcarDisponibilidadActualizada(articuloId);
      ch.ack(msg);
    } catch (error) {
      console.error("Evento inválido:", error.message);
      ch.nack(msg, false, false);
    }
  });
}

module.exports = { suscribirseAEventosDeStock };
```

Con un `marcarDisponibilidadActualizada` simple en el repository que, por ejemplo, actualiza un `last_stock_event_at` o una columna `disponible` que se muestra junto al artículo en `GET /articulos`.

---

## Fase 5 — Dynamic Thread Pool: la "versión alterada" (PB-16)

El `ThreadPoolExecutor` actual es un pool de libro: cada hilo procesa una tarea genuina a la vez. El documento pide específicamente que los hilos **alternen entre hasta 3 tareas simultáneas**. Una forma concreta y defendible de implementarlo: en vez de que cada worker tome 1 tarea y bloquee hasta terminarla, que tome **hasta 3** y las corra de forma concurrente antes de volver a pedir trabajo.

`pool/src/main/java/com/uchfyd/pool/AlternatingWorkerPool.java` (reemplaza el uso directo de `ThreadPoolExecutor` en `ThreadPoolConfig.java`):
```java
package com.uchfyd.pool;

import java.util.List;
import java.util.concurrent.*;
import java.util.stream.Collectors;

public class AlternatingWorkerPool {

    private static final int TAREAS_POR_HILO = 3; // la "alteración" pedida por el TP

    private final BlockingQueue<Runnable> cola;
    private final ExecutorService hilosBase; // tamaño = cantidad de hilos "lógicos" (20-200)
    private final ExecutorService poolInterno = Executors.newCachedThreadPool(); // ejecuta las hasta 3 tareas por hilo
    private volatile boolean activo = true;

    public AlternatingWorkerPool(int corePoolSize, int maxPoolSize, int capacidadCola) {
        this.cola = new LinkedBlockingQueue<>(capacidadCola);
        this.hilosBase = Executors.newFixedThreadPool(maxPoolSize);
        for (int i = 0; i < corePoolSize; i++) {
            hilosBase.submit(this::loopDeHilo);
        }
    }

    // Cada "hilo lógico" del pool, en vez de tomar 1 tarea, toma hasta 3 y las corre juntas.
    private void loopDeHilo() {
        while (activo) {
            try {
                Runnable primera = cola.take(); // espera bloqueante a que haya trabajo
                List<Runnable> lote = new java.util.ArrayList<>();
                lote.add(primera);
                cola.drainTo(lote, TAREAS_POR_HILO - 1); // suma hasta 2 más si ya están disponibles

                List<CompletableFuture<Void>> futuros = lote.stream()
                    .map(tarea -> CompletableFuture.runAsync(tarea, poolInterno))
                    .collect(Collectors.toList());

                CompletableFuture.allOf(futuros.toArray(new CompletableFuture[0])).join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    public boolean submit(Runnable tarea) {
        return cola.offer(tarea); // false si la cola (500) está llena → el controller devuelve 503
    }

    public void shutdown() {
        activo = false;
        hilosBase.shutdownNow();
        poolInterno.shutdown();
    }
}
```

`PoolController.java` cambia de usar `ExecutorService.submit(...).get(timeout)` a `AlternatingWorkerPool.submit(...)`, devolviendo 503 cuando `submit` devuelve `false` (cola llena, equivalente al `RejectedExecutionException` que tenían antes).

> Esta es una interpretación razonable y defendible de "alternar entre hasta 3 tareas simultáneas por hilo", pero es una decisión de diseño — si tienen dudas de si es exactamente lo que el profesor espera, vale la pena confirmarlo en la próxima clase antes de darlo por cerrado.

---

## Fase 6 — Checklist final (contra el escenario medible del documento)

Antes de dar esto por terminado, validen contra lo que el propio TP define como "evidencia de cumplimiento":

- [ ] Prueba de carga: 500 clientes simultáneos comprando el mismo artículo con 100 unidades de stock → exactamente 100 pedidos confirmados (201), 400 rechazados (409), stock final en 0, ningún pedido duplicado.
- [ ] 95% de las respuestas en menos de 2 segundos bajo esa carga.
- [ ] Apagar una instancia de `pedidos`/`catalogo`/`stock` en medio de una ráfaga de compras → ningún usuario activo pierde la sesión ni recibe errores de autenticación.
- [ ] Parar el contenedor de `auth` y Mongo → un pedido de un usuario ya logueado se sigue confirmando igual (porque la validación de JWT es local en el Gateway).
- [ ] Superar las 200 tareas paralelas en el pool → el sistema responde 503 en vez de colgarse.
- [ ] Registro nuevo queda `activo: false`; login con esa cuenta responde 403 hasta que un admin la active con el nuevo endpoint.
- [ ] Dos registros con el mismo email → el segundo responde 409.
- [ ] Un pedido confirmado trae `importeTotal = precio * cantidad` en la respuesta y en la base.

---

## Orden sugerido de commits (para no romper lo que ya funciona)

1. Fase 0 (healthcheck RabbitMQ + CORS) — no toca lógica, solo infraestructura.
2. Fase 1 por servicio, uno a la vez, empezando por `stock` (es el más chico) para probar el molde antes de replicarlo en `catalogo` y `pedidos`.
3. Fase 2, con la migración SQL de `importe_total` (2.5) antes del código que la usa.
4. Fases 3, 4 y 5 en paralelo entre distintos integrantes del equipo, porque no se pisan entre sí.
5. Fase 6 al final, como aceptación antes de la entrega.
