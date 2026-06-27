# 🐳 Ejecutar con Docker

Guía completa para levantar todo el stack de **DeliStars** con Docker Compose.

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) v20+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+

## 🚀 Levantar todo el proyecto

```bash
# Construir las imágenes y levantar todos los servicios
cd delistars-menu-magic
docker compose up --build
```

Esto levanta **6 contenedores**:

| Servicio | Contenedor | Descripción |
|----------|-----------|-------------|
| `postgres` | `delistars_postgres` | Base de datos PostgreSQL 18 |
| `backend` | `delistars_backend` | API REST (Node.js + Express + TypeORM) |
| `frontend` | `delistars_frontend` | Menú del cliente (React + Vite + Nginx) |
| `admin` | `delistars_admin` | Panel administrativo (React + Vite + Nginx) |
| `domicilios` | `delistars_domicilios` | App de domicilios (React + Vite + Firebase + Nginx) |
| `gateway` | `delistars_gateway` | Proxy inverso Nginx — unifica todo bajo el puerto 80 |

## 🌐 ¿Dónde entro?

Todo se accede desde **un solo puerto** gracias al gateway:

| URL | App |
|-----|-----|
| `http://localhost/` | Menú (clientes eligen sede, agregan productos al carrito) |
| `http://localhost/domicilios/` | Domicilios (gestión de pedidos a domicilio, Firebase) |
| `http://localhost/admin/` | Panel administrativo (productos, ventas, trabajadores, sedes) |
| `http://localhost/api/v1/` | API REST directa |

> **Nota:** Al estar todo bajo `localhost:80`, las apps comparten `localStorage`. Esto permite pasar datos (como el carrito) entre el menú y domicilios sin redirecciones complejas.

### API Backend (acceso directo sin gateway)

```
http://localhost:3001/api/v1
```

Endpoints disponibles:

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/v1/categories` | Listar categorías |
| `GET /api/v1/products` | Listar productos |
| `GET /api/v1/sedes` | Listar sedes |
| `GET /api/v1/ventas` | Listar ventas |
| `GET /api/v1/trabajadores` | Listar trabajadores |
| `POST /api/v1/auth/login` | Iniciar sesión |

### Swagger (Documentación de la API)

```
http://localhost:3001/api-docs
```

### Health Check

```
http://localhost:3001/health
```

## 🗄️ Base de datos

### Credenciales

| Campo | Valor |
|-------|-------|
| **Host** | `localhost` |
| **Puerto** | `5432` |
| **Usuario** | `postgres` |
| **Contraseña** | `root` |
| **Base de datos** | `delistars1` |

### Conectarse desde la terminal

```bash
psql -U postgres -h localhost -d delistars1 -p 5432
# Password: root
```

O desde dentro del contenedor:

```bash
docker exec -it delistars_postgres psql -U postgres -d delistars1
```

### Lo que se crea automáticamente

Al levantar por primera vez, se ejecutan `init.sql` y `seeds.sql`:

✅ Base de datos `delistars1`

✅ **8 Tablas:**

| Tabla | Descripción |
|-------|-------------|
| `categoria` | Categorías de productos (Hamburguesas, Perros, Salchipapas, etc.) |
| `tbl_productos` | Productos del menú con precios e imágenes |
| `tbl_sedes` | Sedes del restaurante |
| `tbl_ventas` | Registro de ventas |
| `tbl_detalle_venta` | Detalle de cada venta (productos y cantidades) |
| `tbl_trabajador` | Trabajadores |
| `tbl_roles` | Roles del sistema |
| `tbl_rol_x_usuario` | Relación rol ↔ trabajador |

✅ **Datos semilla (seeds.sql):**
- 6 categorías
- 47 productos con descripciones e imágenes (Cloudinary)
- 2 sedes (Santa Lucía y Santa Teresita, Medellín)

## 📋 Comandos útiles

```bash
# Ver el estado de los contenedores
docker compose ps

# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f frontend
docker compose logs -f admin
docker compose logs -f domicilios
docker compose logs -f gateway

# Detener todos los servicios
docker compose down

# Detener y eliminar volúmenes (BORRA la BD)
docker compose down -v

# Reconstruir solo un servicio
docker compose up --build -d frontend
docker compose up --build -d domicilios

# Reiniciar un servicio sin reconstruir
docker compose restart backend

# Reconstruir todo desde cero
docker compose down && docker compose up --build -d
```

## 🔄 Re-ejecutar seeds manualmente

Si el volumen de PostgreSQL ya existe (no es la primera vez), los scripts de inicialización **no se vuelven a ejecutar**. Para re-poblar la BD:

**Opción 1:** Eliminar el volumen y reconstruir (pierde datos)

```bash
docker compose down -v
docker compose up --build -d
```

**Opción 2:** Ejecutar seeds manualmente (conserva datos existentes)

```bash
docker cp seeds.sql delistars_postgres:/seeds.sql
docker exec -it delistars_postgres psql -U postgres -d delistars1 -f /seeds.sql
```

## 🏗️ Arquitectura

```
                         ┌─────────────────┐
                         │   Navegador     │
                         └────────┬────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │     Gateway (Nginx :80)      │
                    │   delistars_gateway          │
                    └──┬───────┬────────┬────────┬┘
                       │       │        │        │
          /            │       │ /dom.. │ /admin │ /api/*
          ▼            │       ▼        ▼        ▼
   ┌────────────┐      │ ┌──────────┐ ┌──────┐ ┌────────────┐
   │  Frontend  │      │ │Domicilios│ │Admin │ │  Backend   │
   │  (Menú)    │      │ │(Firebase)│ │Panel │ │ (Express)  │
   │  Nginx     │      │ │  Nginx   │ │Nginx │ │  :3000     │
   └────────────┘      │ └──────────┘ └──────┘ └─────┬──────┘
                       │                              │
                       │                              ▼
                       │                       ┌────────────┐
                       │                       │ PostgreSQL  │
                       │                       │   :5432     │
                       │                       └────────────┘
                       │
                       │  Firebase (externo)
                       │  └── Auth (Google)
                       │  └── Firestore
                       │  └── Storage
```

### Cómo funciona el Gateway

El gateway es un nginx que escucha en el puerto 80 y rutea según la URL:

| Ruta | Destino interno | Descripción |
|------|-----------------|-------------|
| `/` | `frontend:80` | Menú del cliente |
| `/domicilios/*` | `domicilios:80` | App de domicilios |
| `/admin/*` | `admin:80` | Panel administrativo |
| `/api/*` | `backend:3000` | API REST |

Los contenedores internos **no exponen puertos al host** (excepto backend en 3001 para acceso directo y postgres en 5432). Todo pasa por el gateway.

## ⚙️ Variables de entorno

Las variables están en el archivo `.env` de la raíz del proyecto. Principales:

```env
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=root
POSTGRES_DB=delistars1

# Backend
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=root
DB_NAME=delistars1
PORT=3000
API_PREFIX=/api/v1

# Frontends (menú y admin)
VITE_API_URL=/api/v1

# Firebase (domicilios)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 🐛 Solución de problemas

### El frontend no muestra datos (productos/sedes vacíos)

Verifica que `VITE_API_URL` en `.env` sea `/api/v1` (ruta relativa, **no** `http://localhost:3000/api/v1`). Si lo cambias, reconstruye:

```bash
docker compose build --no-cache frontend admin
docker compose up -d frontend admin
```

### Domicilios muestra error de Firebase (invalid-api-key)

Verifica que las variables `VITE_FIREBASE_*` están en el `.env`. Si las cambias, reconstruye:

```bash
docker compose build --no-cache domicilios
docker compose up -d domicilios
```

### PostgreSQL no inicia

Si ves errores sobre el formato de datos de PG 18, elimina el volumen:

```bash
docker compose down -v
docker compose up --build -d
```

### El backend no conecta a la BD

Asegúrate de que `DB_HOST=postgres` (nombre del servicio Docker, no `localhost`).

### El gateway devuelve 502 Bad Gateway

Significa que el servicio destino no está listo. Verifica:

```bash
docker compose ps          # ¿todos healthy?
docker compose logs gateway
docker compose logs <servicio-con-problema>
```

### El admin no carga (pantalla en blanco)

El admin usa `base: '/admin/'`. Si ves errores 404 en assets, reconstruye:

```bash
docker compose build --no-cache admin
docker compose up -d admin
```
