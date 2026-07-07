-- Migración 004: Agregar categoría Salsas + productos de salsas y cebollas (adiciones)
-- Fecha: 2026-07-07
-- IMPORTANTE: No reinicia la base de datos. Es aditiva.

BEGIN;

-- 1. Nueva categoría: Salsas
INSERT INTO categoria (id_categoria, nombre_categoria)
VALUES (8, 'Salsas')
ON CONFLICT (id_categoria) DO NOTHING;

-- 2. Productos tipo salsa (categoría 8, precio 0, sin imagen)
INSERT INTO tbl_productos (nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
VALUES
  ('Rosada',        'Salsa rosada',        0, 8, NULL, NULL),
  ('Piña',          'Salsa de piña',       0, 8, NULL, NULL),
  ('Tártara',       'Salsa tártara',       0, 8, NULL, NULL),
  ('Ajo',           'Salsa de ajo',        0, 8, NULL, NULL),
  ('Mayonesa',      'Salsa mayonesa',      0, 8, NULL, NULL),
  ('Mostaza',       'Salsa mostaza',       0, 8, NULL, NULL),
  ('Queso',         'Salsa de queso',      0, 8, NULL, NULL),
  ('Mayochipotle',  'Salsa mayochipotle',  0, 8, NULL, NULL),
  ('Roja',          'Salsa roja',          0, 8, NULL, NULL),
  ('BBQ',           'Salsa BBQ',           0, 8, NULL, NULL),
  ('Guacamole',     'Salsa guacamole',     0, 8, NULL, NULL);

-- 3. Cebollas como adiciones (categoría 5, precio 0, sin imagen)
INSERT INTO tbl_productos (nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
VALUES
  ('Cebolla sofrita', 'Cebolla sofrita', 0, 5, NULL, NULL),
  ('Cebolla cruda',   'Cebolla cruda',   0, 5, NULL, NULL);

COMMIT;
