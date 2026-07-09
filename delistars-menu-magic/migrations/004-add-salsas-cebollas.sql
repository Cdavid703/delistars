-- Migración 004: Agregar categoría Salsas + productos de salsas y cebollas (adiciones)
-- Fecha: 2026-07-07
-- IMPORTANTE: No reinicia la base de datos. Es ADITIVA e IDEMPOTENTE
-- (se puede correr varias veces sin duplicar productos).

BEGIN;

-- 0. Sincronizar la secuencia de id_producto con el máximo real. Los productos
--    se sembraron con ids explícitos (seeds.sql / migraciones previas) sin
--    avanzar el contador serial, así que un INSERT sin id chocaría con ids ya
--    usados (ej. 48). Esto lo corrige y también evita el bug a futuro.
SELECT setval(
  pg_get_serial_sequence('tbl_productos', 'id_producto'),
  (SELECT COALESCE(MAX(id_producto), 1) FROM tbl_productos)
);

-- 1. Nueva categoría: Salsas (id 8)
INSERT INTO categoria (id_categoria, nombre_categoria)
VALUES (8, 'Salsas')
ON CONFLICT (id_categoria) DO NOTHING;

-- 2. Productos tipo salsa (categoría 8, precio 0, sin imagen).
--    tbl_productos no tiene índice único por nombre, así que la idempotencia
--    se logra con WHERE NOT EXISTS: solo inserta lo que aún no está.
INSERT INTO tbl_productos (nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
SELECT v.nombre, v.descr, 0, 8, NULL, NULL
FROM (VALUES
  ('Rosada',        'Salsa rosada'),
  ('Piña',          'Salsa de piña'),
  ('Tártara',       'Salsa tártara'),
  ('Ajo',           'Salsa de ajo'),
  ('Mayonesa',      'Salsa mayonesa'),
  ('Mostaza',       'Salsa mostaza'),
  ('Queso',         'Salsa de queso'),
  ('Mayochipotle',  'Salsa mayochipotle'),
  ('Roja',          'Salsa roja'),
  ('BBQ',           'Salsa BBQ'),
  ('Guacamole',     'Salsa guacamole')
) AS v(nombre, descr)
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_productos p
  WHERE p.nombre_producto = v.nombre AND p.id_categoria = 8
);

-- 3. Cebollas como adiciones (categoría 5, precio 0, sin imagen) — idempotente.
INSERT INTO tbl_productos (nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
SELECT v.nombre, v.descr, 0, 5, NULL, NULL
FROM (VALUES
  ('Cebolla sofrita', 'Cebolla sofrita'),
  ('Cebolla cruda',   'Cebolla cruda')
) AS v(nombre, descr)
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_productos p
  WHERE p.nombre_producto = v.nombre AND p.id_categoria = 5
);

COMMIT;
