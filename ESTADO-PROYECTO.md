# Estado del proyecto DeliStars — integración

> Documento de contexto/handoff. Resume qué se hizo, qué falta y los hallazgos de
> auditoría, para que cualquier sesión (o el colaborador) retome sin perder hilo.
> Última actualización: 2026-06-20.

## Dónde está el código

- **Repo sano:** `D:\dev\delistars` — rama de trabajo **`integracion-admin`**.
- ⚠️ **NO usar `D:\Delistars`** (copia vieja, índice de git corrupto + archivos
  bloqueados por un proceso del sistema). Borrarla tras reiniciar el PC.
- **No trabajar dentro de carpetas sincronizadas** (Google Drive / OneDrive): fue
  la causa probable de la corrupción del índice de git.
- Remoto: `https://github.com/Cdavid703/delistars.git`
  - `integracion-admin` = trabajo de integración (lo nuestro).
  - `develop-jose` = rama del colaborador (intacta).
  - `main` = producción histórica.

## Arquitectura

DeliStars son apps bajo un dominio, servidas por un stack Docker (`delistars-menu-magic/docker-compose.yml`):

| Ruta | App | Servida por |
|------|-----|-------------|
| `/` | Menú (cliente) | contenedor `frontend` |
| `/domicilios/` | Pedidos | contenedor `domicilios` |
| `/turnos/` | Turnos del equipo | contenedor `domicilios` (mismo) |
| `/vacantes/` | Vacantes | contenedor `domicilios` (mismo) |
| `/admin/` | Administración unificada | contenedor `admin` |
| `/api/` | API del menú (Node/TS + PostgreSQL) | contenedor `backend` |

- **Datos:** menú/catálogo en **PostgreSQL** (contenedor); pedidos/turnos/vacantes en **Firestore**.
- **Auth del admin:** Firebase (Google) con allowlist de correos.

## Hecho ✅

- Integración menú → domicilios: handoff del carrito (`ds_cart_handoff`), precio del
  menú llega al cajero (`quotedPrice`), opción **recoger en sede**.
- Sede unificada por `slug` (sin mapa numérico hardcodeado).
- Limpieza de código muerto del menú: `CheckoutDialog`, `whatsapp.ts`, `createVenta`.
- **Admin unificado** en `/admin/`: login Google + allowlist; secciones Resumen,
  Productos, Sedes, Trabajadores, Domicilios, Turnos, Vacantes, Usuarios.
- **Disponibilidad de productos** (activar/desactivar del menú): columna `disponible`
  + backend + toggle en admin + filtro en el menú. Migración en `delistars-menu-magic/migrations/001-add-disponible.sql`.
- Menú con login del equipo y pestañas Turnos/Vacantes (allowlist `front/src/lib/staff.ts`).
- turnos y vacantes servidos desde el contenedor `domicilios` (3 builds).
- `DESPLIEGUE.md` con guía completa.
- **Mejoras recientes (commits de otra sesión):** docker seguro (postgres:17, sin
  5432 expuesto, gateway en `127.0.0.1:8090`), `admin/src/lib/team.ts` como fuente
  única del equipo, queries de Firestore acotadas (`orderBy`+`limit(500)`),
  credenciales fuera de `DESPLIEGUE.md`.
- **Backend con login de administrador** (ver sección dedicada abajo): middleware
  `requireAdmin` protegiendo escrituras + admin enviando el ID token de Firebase.
- **Deploy key SSH** en el VPS en vez de un token de GitHub expuesto en texto plano
  (ver "Estado real del VPS" abajo).

## Pendiente ⬜

1. **Auditoría completa** (quedó a medias por el incidente de corrupción).
2. **Eliminar módulos backend muertos:** `modulo_auth`, `modulo_cart`,
   `modulo_orders`, `modulo_venta` (montados pero ningún frontend los usa).
3. **Limpieza destructiva** (tras verificar en producción): admin viejo embebido en
   domicilios/turnos/vacantes, login `tbl_trabajador`, tablas `tbl_ventas`/`tbl_detalle_venta`.
4. **Migración `disponible`** en la BD de producción si ya existía.
5. **Migrar el VPS al stack Docker integrado** (hoy corre la versión vieja sin
   Docker, sin menú/admin/backend — ver sección "Estado del VPS" abajo). Decisión
   2026-06-20: se deja para después, no es urgente.
6. Llenar las 6 `VITE_FIREBASE_*` reales en los `.env`/`.env.local` locales (las
   plantillas ya están listas, ver abajo).

## Hallazgos de auditoría

- ✅ **Backend sin autenticación → resuelto (2026-06-20):** middleware `requireAdmin`
  (`back/src/middlewares/require-admin.ts`) protege POST/PUT/DELETE de products,
  categories, sedes y trabajadores (excepto `/trabajadores/login`, que sigue público).
  Verifica el ID token de Firebase y exige que el email esté en `ADMIN_EMAILS`. El
  admin (`admin/src/services/api.ts`) ya envía `Authorization: Bearer <idToken>` en
  cada escritura.
- 🔴 **4 módulos backend muertos** (ver pendiente #2).
- 🟢 Contraseñas de trabajador hasheadas con bcrypt. Sin secretos en el repo.
- 🟢 Docker ya endurecido (5432 no expuesto, gateway en loopback). *(Verificar si
  el puerto `3001` del backend sigue publicado; idealmente solo interno.)*
- 🟡 Sede con data maestra en 3 lugares (PostgreSQL `tbl_sedes`, `data/menu.ts`,
  `roles.js`) — el contrato ya se unificó por `slug`, pero la data sigue triplicada.
- 🟡 Productos globales (no por sede); adiciones modeladas como productos (cat 5).

## Backend con login de administrador — implementado (2026-06-20)

El backend verifica el **ID token de Firebase** que envía el admin y exige que el
correo esté en la allowlist. No requiere service-account (verificar token solo
necesita el `projectId`).

- **Protege escritura:** POST/PUT/DELETE de products, categories, sedes,
  trabajadores (`createTrabajador`, `cambiar-contraseña`).
- **Lectura pública:** GET products/categories/sedes/trabajadores y
  `POST /trabajadores/login` (el menú y el login de trabajador los necesitan sin auth).

Backend (`back/src/middlewares/require-admin.ts`):
1. Dependencia `firebase-admin` (instalada).
2. `initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })`.
3. Middleware `requireAdmin`: lee `Authorization: Bearer <idToken>`, `verifyIdToken`,
   valida `email ∈ ADMIN_EMAILS` (env) → 401 sin token/token inválido, 403 si no está
   en la allowlist.
4. Aplicado en las rutas de escritura de `products`, `categories`, `sedes` y
   `trabajador` (routes files).

Admin (`admin/src/services/api.ts`): helper `authHeaders()` adjunta
`Authorization: Bearer ${await auth.currentUser.getIdToken()}` en todas las
escrituras (sedes, trabajadores, productos, categorías).

Env backend (ya en `.env.example` de `back/` y de `delistars-menu-magic/`):
`FIREBASE_PROJECT_ID=delistars-domicilios`, `ADMIN_EMAILS=thebesta4321@gmail.com,cdavid.jaramillo@gmail.com`.

> Pendiente real: probar contra el proyecto Firebase real (necesita las credenciales
> reales en `admin/.env.local` y que el backend tenga `FIREBASE_PROJECT_ID`/`ADMIN_EMAILS`
> en su `.env`) — la lógica se validó con un token inválido (401) pero no con un login real.

## `.env` a recrear (no están en git — instrucciones)

Los valores reales de Firebase y contraseñas **no están en el repo** (a propósito).
Se obtienen de la **consola de Firebase** (Configuración del proyecto → Tus apps) o
se piden a Carlos. En todos los casos: `cp .env.example .env` (o `.env.local`) y llenar.

### A) Despliegue con Docker — UN solo archivo
`delistars-menu-magic/.env` (lo lee `docker-compose`: build-args de los frontends +
`env_file` del backend y postgres). Plantilla:

```env
# Postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<contraseña_fuerte>
POSTGRES_DB=delistars1
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=${POSTGRES_USER}
DB_PASSWORD=${POSTGRES_PASSWORD}
DB_NAME=${POSTGRES_DB}
# Backend
NODE_ENV=production
PORT=3000
API_PREFIX=/api/v1
CORS_ORIGIN=https://delistars.com,http://localhost
JWT_SECRET=<openssl rand -hex 32>
# Backend auth admin (Tarea #1, cuando se implemente)
FIREBASE_PROJECT_ID=delistars-domicilios
ADMIN_EMAILS=thebesta4321@gmail.com,cdavid.jaramillo@gmail.com
# Frontends (Vite) — ruta RELATIVA, no localhost
VITE_API_URL=/api/v1
# Firebase (build de admin, front y domicilios) — valores reales de la consola
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=delistars-domicilios.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=delistars-domicilios
VITE_FIREBASE_STORAGE_BUCKET=delistars-domicilios.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### B) Desarrollo local (npm run dev sin Docker) — un `.env.local` por app
- `delistars-menu-magic/back/.env` → desde `back/.env.example`; ojo: en local
  `DB_HOST=localhost` (no `postgres`) y apunta a tu Postgres local.
- `delistars-menu-magic/admin/.env.local` → `VITE_API_URL=http://localhost:3000/api/v1`
  + las 6 `VITE_FIREBASE_*` (login admin).
- `delistars-menu-magic/front/.env.local` → igual: `VITE_API_URL` + las 6 `VITE_FIREBASE_*`.
- `delistars-menu-magic/.env.example`, `back/.env.example`, `admin/.env.example`,
  `front/.env.example` ya traen las variables (los de admin/front actualizados con Firebase).

> Reglas: `VITE_API_URL` **relativa** (`/api/v1`) en producción; `localhost:3000/api/v1`
> solo en dev directo. Nunca commitear los `.env`/`.env.local` reales (ya en `.gitignore`).

## Despliegue (resumen)

Ver `DESPLIEGUE.md`. Clave: `.env` en el servidor, gateway en `127.0.0.1:8090` con
nginx del host haciendo proxy, `docker compose up --build -d`, y la migración
`disponible` si la BD ya existía. Ojo con la RAM del VPS (2 GB+ o swap).

## Estado real del VPS (verificado 2026-06-20)

El servidor (177.7.52.161, Debian 13, 3.8 GB RAM) **todavía no tiene el stack
integrado**. Sigue corriendo la versión vieja:

- Repo clonado en `/var/www/delistars.com`, rama **`main`** (no `integracion-admin`).
- **Sin Docker instalado.** Nginx del host sirve directo los `dist-*` (domicilios,
  turnos, vacantes, landing) — no hay menú, ni admin unificado, ni backend, ni
  PostgreSQL en el servidor.
- Por lo tanto: migrar a Docker (`DESPLIEGUE.md` completo) sigue pendiente
  (pendiente #5).

### Seguridad: deploy key en vez de token (resuelto 2026-06-20)

El remoto de git en el VPS tenía un **Personal Access Token de GitHub expuesto en
texto plano** en la URL (`https://Cdavid703:ghp_...@github.com/...`). Se reemplazó por:

- Clave SSH dedicada de **solo lectura** en el VPS: `~/.ssh/delistars_deploy_key`.
- Alias en `~/.ssh/config` del VPS: `Host github-delistars` → `github.com` con esa
  identity.
- Remoto del repo en el VPS cambiado a `git@github-delistars:Cdavid703/delistars.git`.
- La clave pública se agregó como **Deploy Key** (solo lectura) en
  `https://github.com/Cdavid703/delistars/settings/keys`.
- El token viejo (`ghp_oPA1...`) fue **revocado** (confirmado 2026-06-20).

## Nota: incidente de corrupción (2026-06-19)

`D:\Delistars` quedó con el índice de git corrupto y 4 archivos bloqueados por un
proceso del sistema (no Drive ni OneDrive — confirmado). Se recuperó **clonando
fresco** desde GitHub a `D:\dev\delistars`. Nada se perdió. Lección: no poner repos
en carpetas sincronizadas; trabajar en rutas locales simples.
