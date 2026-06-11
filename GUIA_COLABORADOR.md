# Guía de Colaboración — DeliStars Web Principal

Bienvenido al proyecto. Esta guía cubre todo lo que necesitas saber
para construir la web principal de DeliStars e integrarla correctamente
con las apps existentes.

---

## 1. Setup inicial

### Clonar el repo y pararte en tu rama

```bash
git clone https://github.com/Cdavid703/delistars.git
cd delistars
git checkout web
```

### Instalar dependencias

```bash
npm install
```

### Herramientas que necesitas tener instaladas

| Herramienta | Para qué |
|-------------|---------|
| Git | Control de versiones |
| Node.js 20+ | Desarrollo local del frontend |
| Docker Desktop | Levantar backend + base de datos en local |

### Stack del proyecto (frontend)

El repo ya tiene configurado:

| Herramienta | Versión |
|-------------|---------|
| React | 19 |
| Vite | 8 |
| Tailwind CSS | 3 |
| Firebase SDK | 12 |
| React Router | 7 |

### Credenciales de Firebase

El repo ya incluye un archivo `.env.example` en la raíz con las variables
que necesitas. **No subas `.env.local` al repo** (ya está en `.gitignore`).

**Paso 1** — copia el ejemplo:

```bash
# Windows
copy .env.example .env.local

# Mac / Linux
cp .env.example .env.local
```

**Paso 2** — pídele a Carlos (cdavid.jaramillo@gmail.com) que te mande
los valores reales por WhatsApp o privado. Tu `.env.local` debe quedar así:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=delistars-domicilios.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=delistars-domicilios
VITE_FIREBASE_STORAGE_BUCKET=delistars-domicilios.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=757400...
VITE_FIREBASE_APP_ID=1:757400...
```

> Todas las apps del proyecto (domicilios, turnos, vacantes, web) usan
> el **mismo** proyecto de Firebase. No crees uno nuevo.

---

## 2. Qué archivos crear y cuáles NO tocar

### Archivos existentes — no los toques

```
src/components/     ← componentes de domicilios
src/pages/          ← páginas de domicilios, turnos, vacantes
src/contexts/       ← auth context de domicilios
src/hooks/          ← hooks de domicilios
src/services/       ← firebase, roles — puedes leerlos, no modificarlos
vite.config.js      ← config de domicilios
vite.turnos.config.js
vite.vacantes.config.js
index.html          ← entry point de domicilios
turnos.html         ← entry point de turnos
```

### Lo que tú creas

```
web.html                ← tu entry point HTML (cópialo de index.html como base)
src/web-main.jsx        ← tu entry point React
src/web/                ← todos tus componentes, páginas y lógica
vite.web.config.js      ← tu config de Vite (ver abajo)

backend/                ← tu backend completo (API + lógica)
  Dockerfile
  ...

admin/                  ← tu frontend de administración (si es separado)
  Dockerfile
  ...

docker-compose.yml      ← orquesta todos tus servicios (ver sección 14)
.env.docker.example     ← variables de entorno para Docker (ver sección 14)
```

### Crear tu config de Vite

Crea `vite.web.config.js` en la raíz:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist-landing',
    emptyOutDir: true,
    rollupOptions: {
      input: { index: 'web.html' },
    },
  },
})
```

### Agregar scripts a package.json

```json
"dev:web":   "vite --config vite.web.config.js --port 5176",
"build:web": "vite build --config vite.web.config.js"
```

### Actualizar Tailwind para que procese tu HTML

En `tailwind.config.js`, cambia la línea de `content`:

```js
// Antes:
content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

// Después:
content: ['./*.html', './src/**/*.{js,ts,jsx,tsx}'],
```

### Correr en local

```bash
npm run dev:web   # → http://localhost:5176
```

---

## 3. Arquitectura del proyecto

El dominio `delistars.com` tiene estas rutas:

| URL | Descripción | Quién lo maneja |
|-----|-------------|-----------------|
| `delistars.com/` | **Tu frontend** — menú, landing | Tu contenedor frontend |
| `delistars.com/menu-api/` | **Tu backend** — API REST / GraphQL | Tu contenedor backend |
| `delistars.com/admin/` | **Tu panel admin** — gestión de menú | Tu contenedor admin |
| `delistars.com/domicilios/` | App de pedidos | Archivos estáticos (nginx) |
| `delistars.com/turnos/` | Gestión de turnos | Archivos estáticos (nginx) |
| `delistars.com/vacantes/` | Ofertas de empleo | Archivos estáticos (nginx) |

Carlos configura el nginx del servidor para que enrute cada URL al
contenedor correcto según los puertos que tú expongas en `docker-compose.yml`.

### Tu stack corre en Docker

Tus tres servicios (frontend menú, backend, PostgreSQL) y opcionalmente
el admin frontend corren todos en contenedores. Carlos hace el deploy
en el VPS — tú nunca necesitas acceso al servidor.

### Placeholder actual en producción

Ya hay una página simple desplegada en `delistars.com/` con tres
botones de navegación. Tu trabajo la reemplaza cuando esté listo.
Puedes verla en vivo para entender el punto de partida.

---

## 4. Contexto del negocio — Las dos sedes

DeliStars es una cadena de comida rápida (hamburguesas y perros
calientes) con **dos locales en Medellín**:

| Sede | Dirección | WhatsApp |
|------|-----------|----------|
| Santa Lucía | Cra. 87 #48e-3, Santa Rosa de Lima | 573135065720 |
| Santa Teresita | Cl 35B #87A-165, La América | 573150634084 |

Ten esto en cuenta para el diseño del menú. Si los productos o precios
varían por sede, coordínalo con Carlos. El sistema de domicilios ya
maneja la selección de sede internamente — cuando el cliente llega
a `/domicilios/` elige su sede allí.

---

## 5. Sistema de diseño — colores y tipografía

El proyecto tiene tokens de Tailwind definidos. Úsalos para que tu
app sea visualmente consistente con el resto de DeliStars.

### Colores

| Clase Tailwind | Hex | Uso sugerido |
|----------------|-----|--------------|
| `cherry` | `#EA3329` | Color principal, botones primarios |
| `tangelo` | `#ED5B3E` | Degradados, acentos cálidos |
| `mustard` | `#E88F00` | Etiquetas, highlights |
| `pepper` | `#CC3300` | Alertas, precios |
| `mint` | `#189386` | Confirmaciones, estados positivos |
| `cream` | `#F4E7D0` | Fondos claros, textos sobre oscuro |
| `smoked` | `#EDEAE6` | Fondos neutros, tarjetas |
| `coal` | `#262626` | Texto principal |

### Degradados listos

```
bg-gradient-hero  → linear-gradient(135deg, #EA3329, #ED5B3E)
bg-gradient-warm  → linear-gradient(180deg, #fdf6ed, #F4E7D0)
bg-gradient-soft  → linear-gradient(135deg, #F4E7D0, #EDEAE6)
```

### Tipografía

| Clase Tailwind | Fuente | Uso |
|----------------|--------|-----|
| `font-display` | Bebas Neue / Oswald | Títulos, headings grandes |
| `font-script` | Pacifico | Decorativo, marca |
| `font-body` | Sora | Texto general, párrafos |

Las fuentes vienen de Google Fonts. En tu `web.html` incluye:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=Pacifico&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

### Sombras y animaciones

```
shadow-soft   → sombra roja suave
shadow-card   → sombra de tarjeta
shadow-glow   → resplandor naranja

animate-fade-in
animate-scale-in
animate-slide-in-right
animate-bounce-soft
animate-pulse-ring
```

---

## 6. Navegación obligatoria — botones que debes implementar

Tu app es el **punto de entrada a todo DeliStars**. Estos accesos
son obligatorios:

### 6.1 "Hacer pedido" → `/domicilios/`

Visible para **todos**. Al hacer clic guarda el carrito en
`localStorage` y redirige (ver sección 7).

### 6.2 "Mis turnos" → `/turnos/`

Visible **solo para empleados** (email en la lista de la sección 8).
La app de turnos gestiona su propio login — solo enlaza a `/turnos/`.

```jsx
const esEmpleado = LISTA_EMPLEADOS.includes(user?.email)
{esEmpleado && <a href="/turnos/">Mis turnos</a>}
```

### 6.3 "Trabaja con nosotros" → `/vacantes/`

Visible para **todos**. Link directo sin lógica adicional.

```html
<a href="/vacantes/">Trabaja con nosotros</a>
```

### Resumen

```
┌────────────────────────────────────────────┐
│           delistars.com/                   │
│                                            │
│  [Hacer pedido]         → /domicilios/     │ ← todos
│  [Mis turnos]           → /turnos/         │ ← solo empleados
│  [Trabaja con nosotros] → /vacantes/       │ ← todos
└────────────────────────────────────────────┘
```

---

## 7. Firebase — proyecto compartido

Todas las apps usan el **mismo proyecto de Firebase**. Un empleado
que inicia sesión con Google una vez es reconocido en todas las apps.

> No crees un proyecto nuevo de Firebase. Usa las credenciales que
> te pasa Carlos en el `.env.local`.

---

## 8. Roles

### 8.1 Los dos roles que implementas tú

| Rol | Descripción |
|-----|-------------|
| `visitante` | Sin login. Puede ver el menú, armar pedido y entrar a vacantes. |
| `empleado` | Login con Google. Email en la lista de empleados. Ve el botón de Turnos. |

### 8.2 Roles internos de domicilios — NO los implementes

Estos roles los resuelve domicilios automáticamente por email.

| Rol | Qué hace |
|-----|----------|
| `admin` | Panel de administración de pedidos |
| `cajero` | Gestión de pedidos en tiempo real |
| `domiciliario` | Panel de entregas |
| `cliente` | Hace pedidos |

### 8.3 Admin unificado

El admin de tu app (quien gestiona precios y menú) usa los mismos
emails de admin del sistema:

```
thebesta4321@gmail.com     — Andrés Elías Arango Monsalve
cdavid.jaramillo@gmail.com — Carlos David Jaramillo (dev)
```

En tu panel de admin incluye un botón **"Ir a panel de domicilios →"**
que redirija a `/domicilios/`. No es necesario fusionar el código.

---

## 9. Lista de empleados registrados

Usa esta lista para determinar si un usuario autenticado es empleado:

| Nombre | Email | Rol en domicilios | Turno |
|--------|-------|-------------------|-------|
| Andrés Elías Arango Monsalve | thebesta4321@gmail.com | Admin / Cajero | — |
| Carlos David Jaramillo | cdavid.jaramillo@gmail.com | Admin / Cajero / Domiciliario | — |
| José Luis Martínez Villegas | lluis02martinez@gmail.com | Cajero | Regular |
| Jose Manuel Londoño Rivillas | josemanuellondonorivillas@gmail.com | Cajero / Domiciliario | Regular |
| Valentina Villegas Mazo | vvillegasmazo@gmail.com | Cajero | Regular |
| Yency Torres Parra | yencytp@gmail.com | Cajero | Regular |
| Sara Castaño Monsalve | monsalvesara1124@gmail.com | — | Regular |
| Juan Diego Rodríguez Martínez | jotade.rodmar@gmail.com | — | Regular |
| Gendelson González Blanco | tikdash17@gmail.com | — | Regular |
| Deisy Henao Grisales | deisyhenao670@gmail.com | — | Servicios |

> Si se contrata personal nuevo, Carlos actualiza esta lista y te avisa.

---

## 10. Entrega del carrito a domicilios

Cuando el cliente haga clic en **"Pedir"**:

```js
localStorage.setItem('delistars_cart', JSON.stringify({
  items: [
    {
      nombre: 'Hamburguesa Clásica',
      cantidad: 2,
      precio_unitario: 18000,
      adiciones: ['Queso extra', 'Bacon'],
      comentario: 'Sin cebolla'
    }
  ],
  total: 36000,
  comentario_general: 'Timbre 3'   // opcional
}))

window.location.href = '/domicilios/'
```

La app de domicilios lee esa clave, omite el formulario de productos
y lleva al cliente directo a elegir sede. Borra la clave al finalizar.

### Claves de localStorage reservadas — NO las uses

| Clave | Uso de domicilios |
|-------|-------------------|
| `viewingAs_<uid>` | Rol activo del staff |
| `sede_<uid>` | Sede seleccionada por el staff |

Solo escribe en `delistars_cart`.

---

## 11. Base de datos — tu PostgreSQL

Tu menú, categorías, adiciones y todo lo relacionado con productos
vive en **tu propio PostgreSQL** dentro del contenedor Docker.
No uses Firestore para datos del menú.

Las colecciones de Firestore que existen son de la app de domicilios —
no las toques ni dupliques:

| Colección | Qué guarda |
|-----------|------------|
| `orders` | Pedidos |
| `roles_cashiers` | Cajeros dinámicos |
| `roles_drivers` | Domiciliarios dinámicos |
| `driver_locations` | Ubicación de domiciliarios |
| `config` | Configuración del negocio |
| `customers` | Datos de clientes |
| `vacantes_postulantes` | Aplicaciones a vacantes |
| `turnos` | Turnos semanales |
| `counters` | Contadores de pedidos |

### Imágenes del menú

Para fotos de productos puedes usar Firebase Storage en la ruta
`/menu/<archivo>` (avísale a Carlos para que habilite esa ruta),
o servir las imágenes desde tu propio backend. Coordínalo con Carlos.

---

## 12. ⚠️ Comportamiento conocido

Si un **empleado** arma un pedido en tu app y hace clic en "Pedir",
cuando llegue a `/domicilios/` el sistema lo reconocerá por su email
y le mostrará el panel de cajero en lugar del panel de cliente.
Esto es comportamiento esperado — Carlos lo resuelve en una próxima
actualización. No es un bug de tu lado.

---

## 13. Reglas de GitHub

### 13.1 Rama de trabajo

Trabaja **únicamente en la rama `web`**. Nunca hagas push directo a `main`.

```bash
# Verificar que estás en la rama correcta antes de cualquier commit
git branch        # debe mostrar * web

# Si alguien más hizo cambios en web, actualízate antes de trabajar
git pull origin web
```

### 13.2 Qué archivos SÍ subir

```
✅ Todo tu código fuente (backend, frontends)
✅ docker-compose.yml
✅ Dockerfile de cada servicio
✅ .env.docker.example     ← solo con nombres de variables, sin valores
✅ dump.sql                ← exportación de tu base de datos
```

### 13.3 Qué archivos NUNCA subir

```
❌ .env
❌ .env.local
❌ .env.docker             ← contiene contraseñas reales
❌ node_modules/
❌ dist/ dist-landing/ dist-web/ o cualquier carpeta de build
❌ *.log
```

Verifica que tu `.gitignore` incluya todas estas entradas antes de
hacer tu primer commit. Si accidentalmente subiste un archivo con
credenciales, avísale a Carlos de inmediato.

### 13.4 Formato de commits

Usa este prefijo en cada commit para que el historial sea legible:

| Prefijo | Cuándo usarlo |
|---------|--------------|
| `feat:` | Nueva funcionalidad |
| `fix:` | Corrección de bug |
| `style:` | Cambios visuales, CSS |
| `db:` | Cambios en la base de datos o dump.sql |
| `docs:` | Documentación |
| `docker:` | Cambios en docker-compose o Dockerfiles |
| `config:` | Variables de entorno, configuración |

```bash
# Ejemplos
git commit -m "feat: agregar carrito de compras"
git commit -m "db: exportar dump con productos iniciales"
git commit -m "docker: agregar healthcheck al servicio backend"
```

### 13.5 Pull Requests

Cuando tengas algo listo para revisión:

1. Haz push de tu rama: `git push origin web`
2. Ve a [github.com/Cdavid703/delistars](https://github.com/Cdavid703/delistars)
3. Crea un Pull Request de `web` → `main`
4. En la descripción explica qué hiciste y qué hay que probar
5. **Espera la aprobación de Carlos** — no asumas que está desplegado hasta que él te confirme

Carlos revisa, aprueba y hace el deploy. Tú no tienes acceso al servidor y no lo necesitas.

### 13.6 Tamaño del dump.sql

GitHub rechaza archivos mayores a **100 MB** (advertencia desde 50 MB).

- Si tu `dump.sql` pesa menos de 50 MB → súbelo normal con git
- Si pesa entre 50 MB y 100 MB → instala [Git LFS](https://git-lfs.com) y súbelo con LFS
- Si pesa más de 100 MB → avísale a Carlos antes para coordinar cómo entregarlo

```bash
# Verificar el tamaño antes de hacer commit
# Windows
(Get-Item dump.sql).Length / 1MB

# Mac / Linux
du -sh dump.sql
```

---

## 15. Integración con el sistema de domicilios

Esta sección define exactamente qué es **responsabilidad tuya** y qué
maneja Carlos.

### ✅ Tu responsabilidad

#### A. Carrito → domicilios (localStorage)

Cuando el cliente haga clic en "Pedir", tu app **debe** escribir el
carrito en localStorage y redirigir. Este contrato es obligatorio para
que los dos sistemas se conecten:

```js
localStorage.setItem('delistars_cart', JSON.stringify({
  items: [
    {
      nombre: 'Hamburguesa Clásica',
      cantidad: 2,
      precio_unitario: 18000,
      adiciones: ['Queso extra'],
      comentario: 'Sin cebolla'
    }
  ],
  total: 36000,
  comentario_general: ''   // opcional
}))

window.location.href = '/domicilios/'
```

Si este paso no está implementado correctamente, el sistema de
domicilios no puede recibir el pedido.

#### B. CORS en tu backend

Tu API debe aceptar peticiones desde estos orígenes:

```
http://localhost:5173      ← domicilios en desarrollo
http://localhost:5176      ← tu frontend en desarrollo
https://delistars.com      ← producción
```

Configúralo en tu backend antes de entregar. Si no está configurado,
el frontend de domicilios no podrá consultar tu API en producción.

#### C. URL de tu API como variable de entorno

Tu frontend **nunca** debe tener la URL del backend hardcodeada.
Usa una variable de entorno:

```js
// ✅ Correcto
const API_URL = import.meta.env.VITE_API_URL

// ❌ Incorrecto
const API_URL = 'http://localhost:8010'
```

Agrega `VITE_API_URL` a tu `.env.docker.example`:

```
VITE_API_URL=http://localhost:8010     # para desarrollo local
# En producción Carlos la define como https://delistars.com/menu-api/
```

#### D. Sin credenciales hardcodeadas

Ninguna contraseña, API key, ni secret en el código. Todo por variables
de entorno. Esto aplica para la conexión a PostgreSQL, cualquier
servicio externo, y cualquier clave de Firebase que uses.

---

### 🔒 Responsabilidad de Carlos (no es tu problema)

| Tarea | Quién |
|-------|-------|
| Configurar nginx para enrutar tus puertos | Carlos |
| Crear `.env.docker` con contraseñas reales en el servidor | Carlos |
| Importar el `dump.sql` en producción | Carlos |
| SSL / HTTPS | Carlos |
| Deploy al servidor | Carlos |
| Leer el carrito de localStorage en la app de domicilios | Carlos |
| Actualizar nginx cuando cambien los puertos | Carlos |

---

## 14. Docker — estructura y deploy

### 14.1 Estructura esperada del docker-compose.yml

Crea `docker-compose.yml` en la raíz del repo con esta estructura base.
Ajusta los nombres de imagen y puertos según tu proyecto, pero **respeta
los puertos asignados abajo** para que Carlos configure nginx sin sorpresas:

```yaml
services:

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # No expongas el puerto 5432 al exterior — solo acceso interno

  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "8010:8000"        # puerto externo 8010 → interno 8000
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
    depends_on:
      - db

  frontend:
    build: ./frontend      # o src/web/ si está ahí
    restart: unless-stopped
    ports:
      - "8011:80"          # puerto externo 8011 → nginx interno en 80

  admin:                   # omite este bloque si el admin está integrado al frontend
    build: ./admin
    restart: unless-stopped
    ports:
      - "8012:80"          # puerto externo 8012 → nginx interno en 80

volumes:
  postgres_data:
```

> **Puertos reservados para tu stack:** `8010` (backend), `8011` (frontend),
> `8012` (admin). No uses puertos que ya tienen otras apps en el servidor
> (80, 443, 3000, 5173).

### 14.2 Variables de entorno para Docker

Crea `.env.docker.example` en la raíz (este sí se sube al repo, sin valores reales):

```
DB_NAME=delistars_menu
DB_USER=delistars
DB_PASSWORD=
```

**Tú no manejas contraseñas de producción.** Carlos crea el archivo
`.env.docker` real directamente en el servidor con las credenciales que
él defina. Tu único trabajo es asegurarte de que tu código lea
`DATABASE_URL` desde variables de entorno y no tenga credenciales
hardcodeadas en ningún archivo.

### 14.3 Levantar en local para desarrollo

```bash
# Primera vez
docker compose up --build

# Las siguientes veces
docker compose up

# Parar
docker compose down
```

Tu backend queda en `http://localhost:8010` y tu frontend en `http://localhost:8011`.

### 14.4 Migrar tu base de datos actual

Cuando tengas los datos listos, exporta tu base de datos y **súbela al repo**:

```bash
# Exportar (ejecuta esto en tu máquina)
pg_dump -U TU_USUARIO -d TU_BASE_DE_DATOS > dump.sql

# Subir al repo
git add dump.sql
git commit -m "db: exportar base de datos inicial"
git push origin web
```

Carlos jala el repo desde el servidor e importa el dump. Tú no haces
nada más — el deploy completo lo maneja Carlos desde GitHub.

### 14.5 URL de conexión — local vs producción

| Entorno | DATABASE_URL |
|---------|-------------|
| Local (fuera de Docker) | `postgresql://TU_USUARIO:TU_PASS@localhost:5432/TU_DB` |
| Local (dentro de Docker) | `postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}` |
| Producción (en el VPS) | `postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}` |

En Docker el hostname del servidor de base de datos es `db` (el nombre
del servicio en docker-compose.yml), no `localhost`. Asegúrate de que
tu backend use la variable de entorno `DATABASE_URL` y no una URL
hardcodeada.
