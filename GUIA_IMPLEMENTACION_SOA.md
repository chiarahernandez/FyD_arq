# Guía de implementación — UCH-FyD SOA (desde cero)

Arquitectura final: Gateway + Autenticación + Catálogo + Stock + Pedidos (todos Node.js/Express) + **Servicio Dynamic Thread Pool en Java/Spring Boot** + Consul (Service Registry) + RabbitMQ (Message Broker) + MySQL + MongoDB, todo orquestado con Docker Compose.

---

## 0. Antes de empezar

### Precondiciones en cada máquina del equipo
- Docker + Docker Compose instalados
- Node.js 20+ y npm
- JDK 17+ y Maven (solo para quien toque el servicio Pool)
- Un cliente de MySQL (DBeaver, TablePlus, o `mysql` CLI) para inspeccionar datos

### Resumen de servicios

| Servicio | Lenguaje | Puerto interno | Rol |
|---|---|---|---|
| gateway | Node/Express | 3000 | API Gateway + SSO (valida JWT) |
| auth | Node/Express | 3001 | Identity Provider (JWT) |
| catalogo | Node/Express | 3002 | Artículos y precios |
| stock | Node/Express | 3003 | Reserva atómica de stock |
| pedidos | Node/Express | 3004 | Orquestador |
| pool | **Java/Spring Boot** | 3005 | Dynamic Thread Pool (ExecutorService real) |
| consul | — (imagen oficial) | 8500 | Service Registry / Discovery |
| rabbitmq | — (imagen oficial) | 5672 / 15672 | Message Broker |
| mysql | — (imagen oficial) | 3306 | BD relacional compartida (articulos, pedidos) |
| mongo | — (imagen oficial) | 27017 | BD de usuarios |

---

## 1. Estructura de carpetas (monorepo)

```
uch-fyd-soa/
├── docker-compose.yml
├── db/
│   └── init.sql
├── gateway/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── auth/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── catalogo/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── stock/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── pedidos/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
└── pool/
    ├── Dockerfile
    ├── pom.xml
    └── src/main/java/com/uchfyd/pool/
        ├── PoolApplication.java
        ├── PoolController.java
        └── ThreadPoolConfig.java
```

Un repo Git compartido (GitHub/GitLab) con una carpeta por servicio. Cada integrante puede trabajar en la suya sin pisarse.

---

## 2. Base de datos

### `db/init.sql` (se ejecuta solo al levantar MySQL por primera vez)

```sql
CREATE DATABASE IF NOT EXISTS uchfyd;
USE uchfyd;

CREATE TABLE articulos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  precio DECIMAL(10,2) NOT NULL,      -- columna de dominio Catálogo
  stock INT NOT NULL DEFAULT 0        -- columna de dominio Stock
);

CREATE TABLE pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id VARCHAR(100) NOT NULL,
  articulo_id INT NOT NULL,
  cantidad INT NOT NULL,
  precio_historico DECIMAL(10,2) NOT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (articulo_id) REFERENCES articulos(id)
);

INSERT INTO articulos (nombre, precio, stock) VALUES
  ('Producto A', 1500.00, 50),
  ('Producto B', 890.50, 120);
```

Recordatorio para la defensa: `articulos` es **una** tabla física, pero Catálogo es dueño de `nombre`/`precio` y Stock es dueño de `stock` — propiedad lógica por columna, no por tabla. Nadie fuera de Stock debe escribir esa columna directamente.

MongoDB no necesita init script: el servicio de Autenticación crea la colección `usuarios` la primera vez que alguien se registra.

---

## 3. `docker-compose.yml` completo

```yaml
version: "3.8"

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: uchfyd
    ports: ["3306:3306"]
    volumes:
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      retries: 10

  mongo:
    image: mongo:7
    ports: ["27017:27017"]

  consul:
    image: hashicorp/consul:1.19
    ports: ["8500:8500"]
    command: "agent -server -ui -bootstrap-expect=1 -client=0.0.0.0"

  rabbitmq:
    image: rabbitmq:3-management
    ports: ["5672:5672", "15672:15672"]

  auth:
    build: ./auth
    environment:
      MONGO_URL: mongodb://mongo:27017/usuarios
      JWT_SECRET: supersecreto
      CONSUL_HOST: consul
    depends_on: [mongo, consul]
    ports: ["3001:3001"]

  catalogo:
    build: ./catalogo
    environment:
      DB_HOST: mysql
      DB_USER: root
      DB_PASS: root
      DB_NAME: uchfyd
      RABBITMQ_URL: amqp://rabbitmq
      CONSUL_HOST: consul
    depends_on:
      mysql: { condition: service_healthy }
      rabbitmq: { condition: service_started }
      consul: { condition: service_started }
    ports: ["3002:3002"]

  stock:
    build: ./stock
    environment:
      DB_HOST: mysql
      DB_USER: root
      DB_PASS: root
      DB_NAME: uchfyd
      RABBITMQ_URL: amqp://rabbitmq
      CONSUL_HOST: consul
    depends_on:
      mysql: { condition: service_healthy }
      rabbitmq: { condition: service_started }
      consul: { condition: service_started }
    ports: ["3003:3003"]

  pool:
    build: ./pool
    environment:
      CONSUL_HOST: consul
    depends_on: [consul]
    ports: ["3005:3005"]

  pedidos:
    build: ./pedidos
    environment:
      DB_HOST: mysql
      DB_USER: root
      DB_PASS: root
      DB_NAME: uchfyd
      CONSUL_HOST: consul
    depends_on:
      mysql: { condition: service_healthy }
      consul: { condition: service_started }
      pool: { condition: service_started }
    ports: ["3004:3004"]

  gateway:
    build: ./gateway
    environment:
      JWT_SECRET: supersecreto
      CONSUL_HOST: consul
    depends_on: [consul, auth, pedidos, catalogo, stock]
    ports: ["3000:3000"]
```

Con esto, `docker compose up --build` levanta las 10 piezas juntas.

---

## 4. Servicio Autenticación (Node — Identity Provider / SSO)

`auth/package.json`:
```json
{
  "name": "auth",
  "dependencies": {
    "express": "^4.19.0",
    "mongoose": "^8.0.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "consul": "^1.2.0"
  }
}
```

`auth/src/index.js` (esqueleto funcional):
```js
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Consul = require("consul");

const app = express();
app.use(express.json());
mongoose.connect(process.env.MONGO_URL);

const Usuario = mongoose.model("Usuario", {
  email: String,
  passwordHash: String,
  activo: { type: Boolean, default: true },
});

app.post("/registro", async (req, res) => {
  const { email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await Usuario.create({ email, passwordHash });
  res.status(201).json({ id: u._id });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const u = await Usuario.findOne({ email });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    return res.status(401).json({ error: "credenciales inválidas" });
  }
  // JWT único = el mismo token sirve para Catálogo, Stock, Pedidos → SSO
  const token = jwt.sign({ sub: u._id, email }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`auth escuchando en ${PORT}`);
  const consul = new Consul({ host: process.env.CONSUL_HOST });
  consul.agent.service.register({
    name: "auth",
    address: "auth",
    port: PORT,
    check: { http: `http://auth:${PORT}/health`, interval: "10s" },
  });
});

app.get("/health", (_, res) => res.sendStatus(200));
```

`auth/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY src ./src
CMD ["node", "src/index.js"]
EXPOSE 3001
```

---

## 5. Servicio Catálogo

Igual estructura de `package.json`/`Dockerfile` que Auth, cambiando dependencias por `mysql2` y `amqplib`.

`catalogo/src/index.js` (puntos clave):
```js
const express = require("express");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Consul = require("consul");

const app = express();
app.use(express.json());
let pool;

app.get("/articulos/:id/precio", async (req, res) => {
  const [rows] = await pool.query("SELECT precio FROM articulos WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.sendStatus(404);
  res.json({ precio: rows[0].precio });
});

app.get("/articulos", async (_, res) => {
  const [rows] = await pool.query("SELECT id, nombre, precio FROM articulos");
  res.json(rows);
});

async function suscribirseAEventosDeStock() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange("stock-events", "fanout");
  const { queue } = await ch.assertQueue("", { exclusive: true });
  await ch.bindQueue(queue, "stock-events", "");
  ch.consume(queue, (msg) => {
    const evento = JSON.parse(msg.content.toString());
    console.log("Stock actualizado (async):", evento); // acá se podría refrescar un caché de disponibilidad
    ch.ack(msg);
  });
}

(async () => {
  pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await suscribirseAEventosDeStock();
  app.listen(3002, () => {
    new Consul({ host: process.env.CONSUL_HOST }).agent.service.register({ name: "catalogo", address: "catalogo", port: 3002 });
  });
})();

app.get("/health", (_, res) => res.sendStatus(200));
```

---

## 6. Servicio Stock (el corazón de la concurrencia optimista)

`stock/src/index.js` (puntos clave):
```js
const express = require("express");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Consul = require("consul");

const app = express();
app.use(express.json());
let pool, canalEventos;

app.post("/stock/reservar", async (req, res) => {
  const { articuloId, cantidad } = req.body;

  // UPDATE atómico: la condición WHERE stock >= cantidad es el control de concurrencia optimista
  const [result] = await pool.query(
    "UPDATE articulos SET stock = stock - ? WHERE id = ? AND stock >= ?",
    [cantidad, articuloId, cantidad]
  );

  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "stock insuficiente" });
  }

  // publicar evento async, NO bloquea la respuesta
  canalEventos.publish("stock-events", "", Buffer.from(JSON.stringify({ articuloId, cantidad })));

  res.json({ ok: true });
});

// endpoint de compensación para el caso borde (Pedidos falla después de reservar)
app.post("/stock/:articuloId/liberar", async (req, res) => {
  const { cantidad } = req.body;
  await pool.query("UPDATE articulos SET stock = stock + ? WHERE id = ?", [cantidad, req.params.articuloId]);
  res.json({ ok: true });
});

(async () => {
  pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  canalEventos = await conn.createChannel();
  await canalEventos.assertExchange("stock-events", "fanout");

  app.listen(3003, () => {
    new Consul({ host: process.env.CONSUL_HOST }).agent.service.register({ name: "stock", address: "stock", port: 3003 });
  });
})();

app.get("/health", (_, res) => res.sendStatus(200));
```

> Nota: el endpoint `/liberar` es el que faltaba documentar como compensación — aprovechá esta implementación para agregarlo también a la tabla de contratos del documento si todavía no está.

---

## 7. Servicio Dynamic Thread Pool (Java/Spring Boot) — la pieza nueva

### `pool/pom.xml`
```xml
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
  </parent>
  <groupId>com.uchfyd</groupId>
  <artifactId>pool</artifactId>
  <version>1.0.0</version>
  <properties><java.version>17</java.version></properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

### `PoolApplication.java`
```java
package com.uchfyd.pool;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PoolApplication {
    public static void main(String[] args) {
        SpringApplication.run(PoolApplication.class, args);
    }
}
```

### `ThreadPoolConfig.java` — acá está el patrón real
```java
package com.uchfyd.pool;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.concurrent.*;

@Configuration
public class ThreadPoolConfig {

    @Bean
    public ExecutorService dynamicThreadPool() {
        return new ThreadPoolExecutor(
            20,                               // corePoolSize
            200,                              // maximumPoolSize (igual al límite del TP2)
            60L, TimeUnit.SECONDS,            // tiempo de vida de hilos ociosos
            new LinkedBlockingQueue<>(500),   // cola de espera
            new ThreadPoolExecutor.AbortPolicy() // rechaza si está saturado
        );
    }
}
```

### `PoolController.java` — el endpoint que llama Pedidos
```java
package com.uchfyd.pool;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.concurrent.*;

@RestController
public class PoolController {

    @Autowired
    private ExecutorService dynamicThreadPool;

    @PostMapping("/pool/ejecutar")
    public ResponseEntity<?> ejecutar(@RequestBody TareaRequest req) {
        try {
            Future<?> tarea = dynamicThreadPool.submit(() -> {
                // acá iría el trabajo real si lo hubiera; en este caso
                // la tarea "pesada" sigue siendo orquestada por Pedidos,
                // el pool solo demuestra la aceptación/rechazo de la tarea
            });
            tarea.get(5, TimeUnit.SECONDS); // timeout corto: no bloquear el camino crítico
            return ResponseEntity.ok().body(new TareaResponse("aceptada"));
        } catch (RejectedExecutionException e) {
            return ResponseEntity.status(503).body(new TareaResponse("capacidad excedida"));
        } catch (TimeoutException | InterruptedException | ExecutionException e) {
            return ResponseEntity.status(500).body(new TareaResponse("error"));
        }
    }

    record TareaRequest(String tareaId) {}
    record TareaResponse(String estado) {}
}
```

### `application.properties`
```properties
server.port=3005
```

### Registro en Consul (sin librería Java extra, con un `curl` al levantar)

Lo más simple para no agregar otra dependencia Java: registrar el servicio vía HTTP contra la API de Consul al arrancar. Se puede hacer con un pequeño `CommandLineRunner`:

```java
package com.uchfyd.pool;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.net.http.*;
import java.net.URI;

@Component
public class ConsulRegistration implements CommandLineRunner {
    @Override
    public void run(String... args) throws Exception {
        String body = """
          {"Name":"pool","Address":"pool","Port":3005}
        """;
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create("http://" + System.getenv("CONSUL_HOST") + ":8500/v1/agent/service/register"))
            .PUT(HttpRequest.BodyPublishers.ofString(body))
            .build();
        client.send(req, HttpResponse.BodyHandlers.ofString());
    }
}
```

### `pool/Dockerfile`
```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 3005
CMD ["java", "-jar", "app.jar"]
```

Timeout corto (5s) y manejo explícito de rechazo son justo lo que te recomendé para acotar el riesgo de este servicio.

---

## 8. Servicio Pedidos (orquestador — llama a Catálogo, Stock y ahora al Pool en Java)

```js
const express = require("express");
const mysql = require("mysql2/promise");
const axios = require("axios");
const Consul = require("consul");

const app = express();
app.use(express.json());
let pool, consul;

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

app.post("/pedidos", async (req, res) => {
  const { usuarioId, articuloId, cantidad } = req.body;

  try {
    const urlPool = await resolverInstancia("pool");
    const resPool = await axios.post(`${urlPool}/pool/ejecutar`, { tareaId: `${usuarioId}-${Date.now()}` });
    if (resPool.data.estado !== "aceptada") {
      return res.status(503).json({ error: "sistema temporalmente ocupado" });
    }

    const urlCatalogo = await resolverInstancia("catalogo");
    const { data: { precio } } = await axios.get(`${urlCatalogo}/articulos/${articuloId}/precio`);

    const urlStock = await resolverInstancia("stock");
    const resStock = await axios.post(`${urlStock}/stock/reservar`, { articuloId, cantidad }, { validateStatus: () => true });

    if (resStock.status === 409) {
      return res.status(409).json({ error: "stock insuficiente" });
    }

    try {
      const [ins] = await pool.query(
        "INSERT INTO pedidos (usuario_id, articulo_id, cantidad, precio_historico) VALUES (?, ?, ?, ?)",
        [usuarioId, articuloId, cantidad, precio]
      );
      res.status(201).json({ pedidoId: ins.insertId });
    } catch (errInsert) {
      // compensación: la reserva de stock ya se hizo, pero el pedido no se concretó
      await axios.post(`${urlStock}/stock/${articuloId}/liberar`, { cantidad });
      throw errInsert;
    }
  } catch (e) {
    res.status(500).json({ error: "error interno" });
  }
});

(async () => {
  pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  consul = new Consul({ host: process.env.CONSUL_HOST });
  app.listen(3004, () => {
    consul.agent.service.register({ name: "pedidos", address: "pedidos", port: 3004 });
  });
})();

app.get("/health", (_, res) => res.sendStatus(200));
```

Fijate que acá quedó resuelto en código el caso de compensación que habían señalado como faltante en el documento: si el `INSERT` falla después de reservar el stock, se llama a `/stock/:id/liberar`.

---

## 9. API Gateway

```js
const express = require("express");
const jwt = require("jsonwebtoken");
const { createProxyMiddleware } = require("http-proxy-middleware");
const Consul = require("consul");

const app = express();
const consul = new Consul({ host: process.env.CONSUL_HOST });

async function resolverInstancia(nombreServicio) {
  const servicios = await consul.health.service({ service: nombreServicio, passing: true });
  const s = servicios[0].Service;
  return `http://${s.Address}:${s.Port}`;
}

function validarJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);
  try {
    req.usuario = jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
}

app.use("/auth", createProxyMiddleware({ target: "http://auth:3001", changeOrigin: true }));

app.use("/pedidos", validarJWT, async (req, res, next) => {
  const target = await resolverInstancia("pedidos");
  createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
});

app.use("/catalogo", validarJWT, async (req, res, next) => {
  const target = await resolverInstancia("catalogo");
  createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
});

app.listen(3000, () => console.log("gateway en 3000"));
```

---

## 10. Service Registry (Consul) y 11. Message Broker (RabbitMQ)

Ya quedan resueltos con las imágenes oficiales en el `docker-compose.yml` (sección 3) — no requieren código propio, solo las llamadas de registro/discovery que ya están en cada servicio. Para verificar que todo se registró bien: abrí `http://localhost:8500/ui` (Consul) y `http://localhost:15672` (RabbitMQ, user/pass `guest`/`guest`).

---

## 12. Orden de desarrollo sugerido para el equipo (4 personas)

1. **Alguien arranca primero** con `docker-compose.yml` + `db/init.sql` + Consul + RabbitMQ levantados y vacíos (sin servicios propios todavía) — esto desbloquea a todos los demás.
2. **Persona A**: Auth + Gateway (son los que dependen uno del otro para probar JWT).
3. **Persona B**: Catálogo + Stock (van juntos porque se comunican por eventos).
4. **Persona C**: Pedidos (depende de que Catálogo/Stock ya tengan sus endpoints mínimos funcionando).
5. **Persona D**: el servicio Pool en Java — puede arrancar en paralelo desde el día 1, porque no depende de nada del resto (solo necesita exponer `/pool/ejecutar`).
6. Integración final: levantar todo junto con `docker compose up --build` y probar el flujo end-to-end (sección 13).

---

## 13. Probar el flujo completo

```bash
# 1. registrar usuario
curl -X POST localhost:3000/auth/registro -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"1234"}'

# 2. login → obtener token
curl -X POST localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"1234"}'

# 3. crear pedido (con el token del paso anterior)
curl -X POST localhost:3000/pedidos -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"usuarioId":"1","articuloId":1,"cantidad":2}'
```

Si el paso 3 devuelve `201`, todo el camino crítico funcionó: Gateway validó el JWT, Pedidos pasó por el Pool en Java, consultó precio en Catálogo, reservó stock en Stock, y guardó el pedido.

---

## 14. Checklist para el día de la demo

- [ ] `docker compose up --build` levanta sin errores
- [ ] Consul UI muestra las 6 instancias registradas (auth, catalogo, stock, pedidos, pool, gateway)
- [ ] Flujo feliz: crear pedido con stock suficiente → `201`
- [ ] Flujo de stock insuficiente → `409`
- [ ] Flujo de pool saturado (simular con muchas requests en paralelo) → `503`
- [ ] Caso de compensación: forzar fallo del `INSERT` y verificar que el stock se libera
- [ ] Tener a mano la explicación de por qué el Pool está en Java (hilos reales de SO vs. event loop de Node) para la defensa oral
