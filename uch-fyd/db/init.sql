
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