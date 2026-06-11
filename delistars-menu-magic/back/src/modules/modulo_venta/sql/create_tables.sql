-- Script SQL para crear las tablas del módulo de ventas

-- Tabla tbl_ventas
CREATE TABLE IF NOT EXISTS tbl_ventas (
  id_venta SERIAL PRIMARY KEY,
  fecha_venta TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  id_trabajador INTEGER,
  id_sede INTEGER NOT NULL,
  total_venta NUMERIC(12, 2) NOT NULL,
  pedido_confirmado BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (id_sede) REFERENCES tbl_sedes(id_sede) ON DELETE CASCADE,
  CONSTRAINT fk_ventas_trabajador FOREIGN KEY (id_trabajador) REFERENCES tbl_trabajadores(id_trabajador) ON DELETE SET NULL
);

-- Tabla tbl_detalle_venta
CREATE TABLE IF NOT EXISTS tbl_detalle_venta (
  id_detalle_venta SERIAL PRIMARY KEY,
  id_venta INTEGER NOT NULL,
  id_producto INTEGER NOT NULL,
  cantidad_producto INTEGER NOT NULL,
  valor_total_x_producto NUMERIC(12, 2) NOT NULL,
  FOREIGN KEY (id_venta) REFERENCES tbl_ventas(id_venta) ON DELETE CASCADE,
  FOREIGN KEY (id_producto) REFERENCES tbl_productos(id_producto) ON DELETE CASCADE
);

-- Índices para optimizar queries
CREATE INDEX idx_ventas_sede ON tbl_ventas(id_sede);
CREATE INDEX idx_ventas_trabajador ON tbl_ventas(id_trabajador);
CREATE INDEX idx_ventas_fecha ON tbl_ventas(fecha_venta);
CREATE INDEX idx_ventas_confirmado ON tbl_ventas(pedido_confirmado);
CREATE INDEX idx_detalle_venta ON tbl_detalle_venta(id_venta);
CREATE INDEX idx_detalle_producto ON tbl_detalle_venta(id_producto);
