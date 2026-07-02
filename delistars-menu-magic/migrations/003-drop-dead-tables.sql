-- 003: Eliminar tablas del sistema legado (idempotente).
--
-- Estas tablas eran del flujo de ventas/login original en Postgres, reemplazado
-- hace tiempo: los pedidos viven en Firestore (colección `orders`) y el staff
-- se autentica con Firebase (Google). Verificado que NINGÚN módulo del backend
-- ni ninguna app las consulta (se eliminó modulo_trabajador y antes
-- modulo_venta/auth/cart/orders).
--
-- ⚠️ Antes de aplicar en producción: hacer backup completo
--    docker exec delistars_postgres pg_dump -U postgres delistars1 > backup.sql
--
-- Aplicar:
--   docker cp 003-drop-dead-tables.sql delistars_postgres:/tmp/
--   docker exec delistars_postgres psql -U postgres -d delistars1 \
--     --single-transaction -v ON_ERROR_STOP=1 -f /tmp/003-drop-dead-tables.sql

-- El orden respeta las claves foráneas (hijas primero).
DROP TABLE IF EXISTS public.tbl_detalle_venta;
DROP TABLE IF EXISTS public.tbl_ventas;
DROP TABLE IF EXISTS public.tbl_rol_x_usuario;
DROP TABLE IF EXISTS public.tbl_roles;
DROP TABLE IF EXISTS public.tbl_trabajador;
