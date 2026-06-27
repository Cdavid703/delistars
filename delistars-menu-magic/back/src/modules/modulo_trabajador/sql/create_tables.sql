-- Script SQL para crear la tabla de trabajadores

CREATE TABLE IF NOT EXISTS tbl_trabajador (
  id_trabajador SERIAL PRIMARY KEY,
  nombre_trabajador VARCHAR(100) NOT NULL,
  apellido_trabajador VARCHAR(100) NOT NULL,
  usuario VARCHAR(70) NOT NULL UNIQUE,
  usuario_password VARCHAR(255) NOT NULL,
  fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para optimizar queries
CREATE INDEX IF NOT EXISTS idx_trabajador_usuario ON tbl_trabajador(usuario);
CREATE INDEX IF NOT EXISTS idx_trabajador_nombre ON tbl_trabajador(nombre_trabajador, apellido_trabajador);

-- Trigger para actualizar fecha_actualizacion automáticamente
CREATE OR REPLACE FUNCTION update_fecha_actualizacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_actualizacion = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_fecha_actualizacion
BEFORE UPDATE ON tbl_trabajador
FOR EACH ROW
EXECUTE FUNCTION update_fecha_actualizacion();
