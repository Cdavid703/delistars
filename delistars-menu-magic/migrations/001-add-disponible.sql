-- Migración: agregar disponibilidad a productos.
-- init.sql solo corre cuando el volumen de Postgres está vacío, así que para
-- una base YA existente en el servidor ejecuta esta migración manualmente:
--
--   docker cp migrations/001-add-disponible.sql delistars_postgres:/mig.sql
--   docker exec -it delistars_postgres psql -U postgres -d delistars1 -f /mig.sql
--
-- Es idempotente: se puede correr varias veces sin error.

ALTER TABLE IF EXISTS public.tbl_productos
  ADD COLUMN IF NOT EXISTS disponible boolean NOT NULL DEFAULT true;
