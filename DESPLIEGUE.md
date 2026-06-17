# 🚀 Despliegue completo DeliStars (menú + domicilios + base de datos)

Guía para que **Carlos** despliegue todo el stack en el VPS. El colaborador solo
sube código a GitHub; el deploy lo haces tú.

> Esta guía reemplaza a `delistars-menu-magic/RUN_ON_SERVER.md` para el despliegue
> **integrado** (ese documento del colaborador asume el menú como repo aparte y
> tiene puertos desactualizados). El `DEPLOY.md` de la raíz era solo del domicilios
> estático y queda obsoleto cuando migras a Docker.

---

## 1. Qué se levanta

Un solo `docker compose` levanta 6 contenedores en red interna:

| Contenedor | Qué es | Puerto |
|------------|--------|--------|
| `postgres` | Base de datos del menú (productos, categorías, sedes) | 5432 (solo interno/servidor) |
| `backend` | API del menú (Node/TS) | 3001 → 3000 (interno) |
| `frontend` | Menú web (clientes) | vía gateway |
| `admin` | Panel admin del menú | vía gateway |
| `domicilios` | App de pedidos (la tuya) | vía gateway |
| `gateway` | Nginx que enruta todo | **80** |

El gateway enruta:

```
/            → frontend (menú)
/domicilios/ → domicilios
/admin/      → admin
/api/        → backend
```

**Dónde vive la base de datos:** en el contenedor `postgres`, en TU servidor.
No está en GitHub ni en Firebase. Los 47 productos vienen de `seeds.sql` y se
cargan **solo en el primer arranque** (ver paso 5).

---

## 2. Estructura del repo (importante)

El menú es una **subcarpeta** del repo de domicilios, no un repo aparte. El
`docker-compose.yml` está dentro de `delistars-menu-magic/` y construye el
servicio `domicilios` desde la carpeta padre (`context: ../`). Por eso:

```bash
git clone git@github.com:Cdavid703/delistars.git
cd delistars
git checkout main          # o la rama que hayas mergeado
cd delistars-menu-magic    # aquí está el docker-compose.yml
```

---

## 3. Requisitos en el servidor

```bash
docker --version          # v20+
docker compose version    # v2+
```

Si no está Docker: `curl -fsSL https://get.docker.com | sh`

---

## 4. Crear el `.env` (en `delistars-menu-magic/`)

```bash
cp .env.example .env
nano .env
```

Llena estos valores **obligatorios**:

```env
# Postgres — pon una contraseña fuerte
POSTGRES_PASSWORD=<contraseña_segura>

# Backend
NODE_ENV=production
JWT_SECRET=<secreto_largo_y_aleatorio>     # genera con: openssl rand -hex 32
CORS_ORIGIN=https://delistars.com,http://localhost

# Frontends — ruta RELATIVA (no localhost)
VITE_API_URL=/api/v1

# Firebase (mismo proyecto delistars-domicilios) — para construir "domicilios"
VITE_FIREBASE_API_KEY=AIzaSyCLB7z7lDPeNDa0qEYFVWXyCLlzNsJzrww
VITE_FIREBASE_AUTH_DOMAIN=delistars-domicilios.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=delistars-domicilios
VITE_FIREBASE_STORAGE_BUCKET=delistars-domicilios.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=757400771350
VITE_FIREBASE_APP_ID=1:757400771350:web:57cb5b1affd8e170850e37
```

> El `.env` nunca se sube al repo (está en `.gitignore`). Lo creas solo en el servidor.

---

## 5. ⚠️ Conflicto de puerto 80 (tu caso)

Tu VPS **ya corre nginx en el host** (sirve delistars.com y jaralingua.com). El
gateway de Docker también quiere el puerto 80 → **chocan**. No expongas el
gateway directo en 80. En su lugar:

**a)** Edita el mapeo del gateway en `docker-compose.yml` para que escuche solo en
localhost en otro puerto:

```yaml
  gateway:
    ports:
      - "127.0.0.1:8090:80"   # en vez de "80:80"
```

**b)** Agrega un server block en el nginx del host para delistars.com:

```nginx
server {
    server_name delistars.com www.delistars.com;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d delistars.com -d www.delistars.com   # HTTPS
```

Así jaralingua.com queda intacto y delistars.com pasa por el stack Docker.

---

## 6. Levantar el stack

```bash
docker compose up --build -d
```

Esto construye las imágenes, descarga PostgreSQL, **crea la BD y carga init.sql +
seeds.sql (47 productos)**, y levanta los 6 contenedores.

---

## 7. Verificar

```bash
docker compose ps                          # todos "Up (healthy)"
curl http://localhost:3001/api/v1/categories   # debe devolver las categorías
curl http://127.0.0.1:8090/                # debe devolver el HTML del menú
```

Luego en el navegador:
- `https://delistars.com/` → menú (selección de productos)
- `https://delistars.com/domicilios/` → app de pedidos
- `https://delistars.com/admin/` → panel admin del menú

---

## 8. Re-cargar productos (el seed solo corre la 1ª vez)

`init.sql` y `seeds.sql` se ejecutan **solo cuando el volumen está vacío**. Si ya
desplegaste antes y necesitas recargar:

```bash
# OJO: borra TODA la base de datos del menú y vuelve a sembrar
docker compose down -v
docker compose up --build -d
```

O re-ejecutar solo el seed sin borrar (usa el nombre real de tu DB, POSTGRES_DB):

```bash
docker cp seeds.sql delistars_postgres:/seeds.sql
docker exec -it delistars_postgres psql -U postgres -d delistars1 -f /seeds.sql
```

---

## 9. Actualizar tras un nuevo push del colaborador

```bash
cd delistars && git pull && cd delistars-menu-magic
docker compose up --build -d
```

Los productos NO se borran (el volumen persiste). Para cambios de menú, el
colaborador los gestiona desde el panel admin o actualizando la BD.

---

## 10. Comandos útiles

```bash
docker compose logs -f backend     # logs de un servicio
docker compose restart             # reiniciar
docker compose down                # detener (conserva la BD)
```

---

## Checklist antes de desplegar

- [ ] El colaborador corrigió `VITE_API_URL=/api/v1` (relativo) en su `.env.example`
- [ ] `CORS_ORIGIN` incluye `https://delistars.com`
- [ ] `JWT_SECRET` y `POSTGRES_PASSWORD` cambiados (no los de ejemplo)
- [ ] Las 6 variables `VITE_FIREBASE_*` están en el `.env`
- [ ] Gateway mapeado a `127.0.0.1:8090` y host nginx haciendo proxy
