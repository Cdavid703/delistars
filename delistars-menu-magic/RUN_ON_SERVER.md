# 🖥️ Despliegue en Servidor (VPS / PC remoto)

Guía paso a paso para subir **DeliStars Menu Magic** a un servidor con Docker.

## Requisitos del servidor

- **Sistema operativo:** Ubuntu 22.04+ / Debian 12+ (o cualquier Linux con Docker)
- **Docker** v20+ y **Docker Compose** v2+
- **Git**
- **RAM mínima:** 1 GB
- **Almacenamiento:** 2 GB libres
- Puertos **80** y **8080** disponibles (o los que configures)

## 1. Instalar Docker en el servidor

Si el servidor no tiene Docker:

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Agregar tu usuario al grupo docker (evita usar sudo)
sudo usermod -aG docker $USER

# Cerrar sesión y volver a entrar para que tome efecto
exit
# (reconectar SSH)

# Verificar instalación
docker --version
docker compose version
```

## 2. Clonar el repositorio

```bash
git clone <url-del-repositorio> delistars-menu-magic
cd delistars-menu-magic
```

## 3. Configurar variables de entorno

```bash
cp .env.example .env
nano .env  # o vim .env
```

### Variables importantes a cambiar:

```env
# ⚠️ CAMBIAR las contraseñas en producción
POSTGRES_PASSWORD=una_contraseña_segura_aqui
DB_PASSWORD=una_contraseña_segura_aqui

# ⚠️ CAMBIAR los secretos JWT
JWT_SECRET=generar_un_secreto_largo_y_aleatorio
JWT_REFRESH_SECRET=otro_secreto_diferente_y_largo

# Cambiar a production
NODE_ENV=production

# CORS: agregar el dominio o IP del servidor
CORS_ORIGIN=http://tu-dominio.com,http://tu-ip-publica,http://localhost

# Frontends: dejar como ruta relativa (el proxy de Nginx se encarga)
VITE_API_URL=/api/v1
```

> **Nota:** `VITE_API_URL=/api/v1` debe ser ruta relativa. Los frontends usan el proxy reverso de Nginx para comunicarse con el backend internamente. **NO** pongas `http://localhost:3000/api/v1`.

## 4. Construir y levantar

```bash
docker compose up --build -d
```

Esto:
1. Construye las 3 imágenes (backend, frontend, admin)
2. Descarga PostgreSQL 18
3. Crea la base de datos y ejecuta `init.sql` + `seeds.sql`
4. Levanta los 4 contenedores

## 5. Verificar que todo funcione

```bash
# Ver estado de los contenedores
docker compose ps

# Deberías ver algo así:
# NAME                 STATUS          PORTS
# delistars_postgres   Up (healthy)    0.0.0.0:5432->5432/tcp
# delistars_backend    Up (healthy)    0.0.0.0:3001->3000/tcp
# delistars_frontend   Up (healthy)    0.0.0.0:80->80/tcp
# delistars_admin      Up (healthy)    0.0.0.0:8080->80/tcp
```

```bash
# Verificar que la API responde
curl http://localhost:3001/health

# Verificar que las categorías se cargaron
curl http://localhost/api/v1/categories
```

## 6. Acceder a la aplicación

Reemplaza `<IP_DEL_SERVIDOR>` con la IP pública de tu servidor o tu dominio:

| Servicio | URL |
|----------|-----|
| **Frontend** (clientes) | `http://<IP_DEL_SERVIDOR>` |
| **Admin** (panel administrativo) | `http://<IP_DEL_SERVIDOR>:8080` |
| **API** (directa) | `http://<IP_DEL_SERVIDOR>:3001/api/v1` |
| **Swagger** (docs API) | `http://<IP_DEL_SERVIDOR>:3001/api-docs` |

### Ejemplos con IP:

```
http://190.85.123.45          → Frontend
http://190.85.123.45:8080     → Admin
http://190.85.123.45:3001/api/v1/products  → API
```

### Ejemplos con dominio:

```
http://delistars.com          → Frontend
http://admin.delistars.com    → Admin (requiere configuración extra de DNS)
```

## 7. Abrir puertos en el firewall

Si usas `ufw` (Ubuntu):

```bash
sudo ufw allow 80/tcp     # Frontend
sudo ufw allow 8080/tcp   # Admin
sudo ufw allow 22/tcp     # SSH (¡no bloquear!)
# El puerto 3001 y 5432 NO los expongas públicamente por seguridad
```

Si usas un proveedor cloud (AWS, DigitalOcean, etc.), abre los puertos en el **Security Group** o **Firewall** del panel de control.

## Comandos útiles en el servidor

```bash
# Ver logs en tiempo real
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f backend

# Reiniciar todo
docker compose restart

# Detener todo
docker compose down

# Actualizar el código y redesplegar
git pull
docker compose up --build -d

# Reconstruir desde cero (¡BORRA la base de datos!)
docker compose down -v
docker compose up --build -d
```

## Re-ejecutar seeds manualmente

Si el volumen de Postgres ya existe y necesitas re-cargar los datos:

```bash
docker cp seeds.sql delistars_postgres:/seeds.sql
docker exec -it delistars_postgres psql -U postgres -d delistars1 -f /seeds.sql
```

## (Opcional) Configurar dominio con HTTPS

Si tienes un dominio, puedes usar **Nginx + Certbot** en el host para agregar HTTPS:

```bash
# Instalar Nginx y Certbot en el servidor (fuera de Docker)
sudo apt install nginx certbot python3-certbot-nginx -y
```

Crear configuración de Nginx en el host (`/etc/nginx/sites-available/delistars`):

```nginx
server {
    server_name delistars.com www.delistars.com;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    server_name admin.delistars.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Activar y obtener certificado SSL
sudo ln -s /etc/nginx/sites-available/delistars /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d delistars.com -d www.delistars.com -d admin.delistars.com
```

Con esto tendrías:
- `https://delistars.com` → Frontend
- `https://admin.delistars.com` → Admin

## Resumen rápido (TL;DR)

```bash
# En el servidor:
git clone <repo-url> delistars-menu-magic
cd delistars-menu-magic
cp .env.example .env
nano .env                        # Cambiar contraseñas y JWT_SECRET
docker compose up --build -d     # ¡Listo!

# Acceder:
# Frontend  → http://<IP>
# Admin     → http://<IP>:8080
```
