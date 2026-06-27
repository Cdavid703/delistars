# Plan de migración del VPS al stack Docker integrado

> Plan **para ejecutar más adelante**, no ejecutado aún. Escrito 2026-06-20 a partir
> del estado **real verificado** del VPS (no del genérico). Complementa a
> `DESPLIEGUE.md` (pasos genéricos) con las particularidades de este servidor.
>
> ⚠️ Esto toca **producción**. Hacerlo con tiempo y una ventana de mantenimiento.

---

## 0. Estado real del VPS (verificado 2026-06-20)

- **Host:** `177.7.52.161`, Debian 13 (trixie), **3.8 GB RAM, 0 swap**.
- **Repo:** `/var/www/delistars.com`, rama **`main`** (versión vieja, pre-integración).
- **Sin Docker instalado.**
- **Nginx del host** sirve archivos estáticos (no hay menú/admin/backend/PostgreSQL):
  | Ruta | Sirve hoy | Origen |
  |------|-----------|--------|
  | `/` | **Landing de marketing** ("DeliStars · Tasty & Cool") | `dist-landing/` (desplegado a mano, **NO está en git**) |
  | `/domicilios/` | App de pedidos | `dist/` |
  | `/turnos/` | Turnos | `dist-turnos/` |
  | `/vacantes/` | Vacantes | `dist-vacantes/` |
- **SSL:** Let's Encrypt para `delistars.com` (config en `/etc/nginx/sites-enabled/delistars.com`).
- **Otros sitios en el mismo host (NO TOCAR):** `jaralingua.com`, `cdavidjaramillo.tech`.
- **Firewall:** `ufw` inactivo → los puertos publicados son alcanzables desde
  internet. Por eso el backend se bindeó a `127.0.0.1` (ya hecho en el compose).
- **Remoto git del VPS:** ya migrado a deploy key SSH
  (`git@github-delistars:Cdavid703/delistars.git`), solo lectura.

---

## 1. ⚠️ DECISIÓN OBLIGATORIA antes de migrar: la ruta `/`

Hay un **conflicto de rutas** que hay que resolver primero:

- **Hoy:** `delistars.com/` = landing de marketing.
- **Stack Docker (gateway):** `delistars.com/` = **menú del cliente** (contenedor `frontend`).

El gateway integrado enruta: `/`→menú, `/domicilios/`, `/turnos/`, `/vacantes/`,
`/admin/`, `/api/`. **No contempla la landing.**

Opciones (elegir una):

- **A) La landing sigue en `/`, el menú va a otra ruta (ej. `/menu/`).** Requiere
  ajustar el gateway y el `base` de Vite del front. Conserva la landing actual.
- **B) El menú pasa a ser `/` y se elimina la landing.** Lo más simple; es lo que
  asume `DESPLIEGUE.md` tal cual. Se pierde la landing de marketing.
- **C) La landing se sirve aparte por el nginx del host** (no por el gateway) y el
  resto pasa por Docker. El host hace: `/` → `dist-landing` estático; `/menu/`,
  `/domicilios/`, `/admin/`, `/api/`, etc. → proxy a `127.0.0.1:8090`.

> **Recomendación:** opción **C** si quieres conservar la landing con el mínimo
> cambio de código (la landing no está en el repo, así que sacarla del flujo Docker
> evita tener que integrarla). Si la landing ya no importa, la **B** es la más limpia.
>
> **Esta decisión define los pasos 5–6.** No avanzar sin elegir.

---

## 2. Pre-requisitos y red de seguridad

### 2.1 Backup (antes de nada)
```bash
ssh root@177.7.52.161
cd /var/www/delistars.com
# Respaldar los dist-* actuales y la config nginx por si hay que revertir
tar czf ~/backup-delistars-$(date +%F).tgz dist dist-landing dist-turnos dist-vacantes
cp /etc/nginx/sites-enabled/delistars.com ~/delistars.com.nginx.bak
```
> La data de pedidos/turnos/vacantes vive en **Firestore**, no en el VPS → no hay
> que respaldarla. El menú (47 productos) se recrea desde `seeds.sql`.

### 2.2 Swap (3.8 GB RAM es justo para 4 builds de Vite)
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # confirmar swap activo
```

### 2.3 Instalar Docker
```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

---

## 3. Traer el código integrado

```bash
cd /var/www/delistars.com
git fetch origin
git checkout integracion-admin     # o `main` si ya se mergeó la integración
git pull
cd delistars-menu-magic            # aquí vive el docker-compose.yml
```

> Decisión paralela: ¿desplegar desde `integracion-admin` o **mergear a `main`** y
> desplegar `main`? Recomendado mergear a `main` cuando todo esté probado, para que
> producción siga la convención de rama estable.

---

## 4. Crear el `.env` de producción

```bash
cd /var/www/delistars.com/delistars-menu-magic
cp .env.example .env
nano .env
```

Valores **obligatorios** (los secretos NO están en git):
```env
POSTGRES_PASSWORD=<contraseña_fuerte>
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGIN=https://delistars.com        # fijar el origin real (no dejar *)
VITE_API_URL=/api/v1                      # RELATIVO, no localhost

# Auth admin (ya implementado)
FIREBASE_PROJECT_ID=delistars-domicilios
ADMIN_EMAILS=thebesta4321@gmail.com,cdavid.jaramillo@gmail.com
TRUST_PROXY_HOPS=2                         # host nginx + gateway Docker

# Firebase web (de la consola; públicos por diseño)
VITE_FIREBASE_API_KEY=<...>
VITE_FIREBASE_AUTH_DOMAIN=delistars-domicilios.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=delistars-domicilios
VITE_FIREBASE_STORAGE_BUCKET=delistars-domicilios.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=757400771350
VITE_FIREBASE_APP_ID=<...>
```

---

## 5. Levantar el stack Docker

```bash
docker compose up --build -d        # primer build ~5–15 min (por eso el swap)
docker compose ps                   # todos "Up (healthy)"
```

Verificación interna (antes de tocar nginx del host):
```bash
curl http://127.0.0.1:8090/                      # HTML del menú
curl http://127.0.0.1:8090/api/v1/categories     # categorías (JSON)
curl http://127.0.0.1:8090/admin/                # HTML del admin
```
El gateway escucha solo en `127.0.0.1:8090` (no choca con el 80/443 del host).

---

## 6. Cambiar el nginx del host (según la decisión del paso 1)

Editar `/etc/nginx/sites-enabled/delistars.com`. **Conservar el bloque SSL y los
`server_name` actuales.** Reemplazar los `location` que sirven `dist-*` por proxy
al gateway.

### Si elegiste B (menú en `/`, sin landing)
```nginx
# dentro del server { ... listen 443 ssl ... }
location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
# Eliminar los location /domicilios/ /turnos/ /vacantes/ con alias dist-*
# (el gateway ya los maneja vía el proxy de '/').
```

### Si elegiste C (landing estática en `/`, resto por Docker)
```nginx
location = / {
    root /var/www/delistars.com/dist-landing;
    try_files /index.html =404;
}
location /assets/ { root /var/www/delistars.com/dist-landing; }   # ajustar a la landing

location /menu/        { proxy_pass http://127.0.0.1:8090/; <headers> }
location /domicilios/  { proxy_pass http://127.0.0.1:8090/domicilios/; <headers> }
location /turnos/      { proxy_pass http://127.0.0.1:8090/turnos/; <headers> }
location /vacantes/    { proxy_pass http://127.0.0.1:8090/vacantes/; <headers> }
location /admin/       { proxy_pass http://127.0.0.1:8090/admin/; <headers> }
location /api/         { proxy_pass http://127.0.0.1:8090/api/; <headers> }
```
> (C requiere además mover el menú a `/menu/`: ajustar `base` en el `vite.config.ts`
> del front y el `location / → /menu/` del gateway. Más trabajo de código.)

Aplicar:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. Verificación end-to-end (en el navegador)

- `https://delistars.com/` → lo que definiste (menú o landing).
- `https://delistars.com/domicilios/` → pedidos.
- `https://delistars.com/turnos/` y `/vacantes/` → cargan.
- `https://delistars.com/admin/` → login Google; entrar con un correo de `ADMIN_EMAILS`.
- **Probar una escritura en el admin** (crear/editar producto) → debe funcionar
  (token Firebase) y, sin login, devolver 401/403.
- `https://delistars.com/api/v1/categories` → JSON (lectura pública).
- Confirmar que **`/api-docs` NO responde** (swagger apagado en prod).
- Confirmar que el backend **no** es accesible por `http://177.7.52.161:3001`
  (bindeado a loopback).

---

## 8. Endurecimiento post-migración (pendientes de la auditoría)

- **Headers de seguridad** en el `server {}` del host:
  ```nginx
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  ```
- **Firewall** (`ufw` está inactivo): permitir solo 22/80/443.
  ```bash
  sudo ufw allow 22,80,443/tcp && sudo ufw enable
  ```
- Confirmar `CORS_ORIGIN=https://delistars.com` (no `*`).

---

## 9. Rollback (si algo sale mal)

```bash
# 1. Restaurar la config nginx anterior
cp ~/delistars.com.nginx.bak /etc/nginx/sites-enabled/delistars.com
sudo nginx -t && sudo systemctl reload nginx
# 2. (opcional) apagar el stack Docker
cd /var/www/delistars.com/delistars-menu-magic && docker compose down
```
La versión vieja (`dist-*` estáticos) vuelve a servirse de inmediato. El stack
Docker apagado no afecta a `jaralingua.com` ni `cdavidjaramillo.tech`.

---

## 10. Actualizaciones futuras (tras la migración)

```bash
cd /var/www/delistars.com && git pull
cd delistars-menu-magic && docker compose up --build -d
```
Los productos NO se borran (volumen `postgres_data` persiste). Cambios de menú →
desde el panel admin.

---

## Checklist resumido

- [ ] Decidir la ruta `/` (landing vs menú) — paso 1
- [ ] Backup de `dist-*` y nginx
- [ ] Swap 2 GB
- [ ] Instalar Docker
- [ ] `checkout` rama + `.env` de producción (con `TRUST_PROXY_HOPS=2`, `CORS_ORIGIN` real)
- [ ] `docker compose up --build -d` + verificación interna `127.0.0.1:8090`
- [ ] Ajustar nginx del host + `nginx -t` + reload
- [ ] Verificación end-to-end (login admin, escritura protegida, swagger apagado, 3001 no expuesto)
- [ ] Headers de seguridad + ufw
- [ ] Probar rollback mentalmente / dejar el `.bak` a mano
