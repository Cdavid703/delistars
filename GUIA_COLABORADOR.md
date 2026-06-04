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

### Stack del proyecto

El repo ya tiene configurado:

| Herramienta | Versión |
|-------------|---------|
| React | 19 |
| Vite | 8 |
| Tailwind CSS | 3 |
| Firebase SDK | 12 |
| React Router | 7 |

### Credenciales de Firebase

Copia el archivo `.env.example` como `.env.local` en la raíz y pídele
a Carlos los valores reales. No subas `.env.local` al repo (ya está en `.gitignore`).

```bash
cp .env.example .env.local
```

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

El dominio `delistars.com` tiene cuatro apps independientes:

| URL | Descripción | Acceso |
|-----|-------------|--------|
| `delistars.com/` | **Tu app** — menú, landing, punto de entrada | Todos |
| `delistars.com/domicilios/` | App de pedidos (cajero, cliente, domiciliario) | Todos |
| `delistars.com/turnos/` | Gestión de turnos del equipo | Solo empleados |
| `delistars.com/vacantes/` | Ofertas de empleo | Todos |

Cada app tiene su propio build de Vite y se despliega de forma
independiente. No comparten código en tiempo de ejecución, solo
el dominio y el proyecto de Firebase.

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

## 11. Colecciones de Firestore existentes — no las dupliques

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

Para tus colecciones usa el prefijo `menu_`:
`menu_productos`, `menu_categorias`, `menu_adiciones`.

### Imágenes en Firebase Storage

Para fotos del menú usa la ruta `/menu/<archivo>`. Avísale a Carlos
antes de implementarlo para que habilite esa ruta en las reglas de
Storage.

---

## 12. ⚠️ Comportamiento conocido

Si un **empleado** arma un pedido en tu app y hace clic en "Pedir",
cuando llegue a `/domicilios/` el sistema lo reconocerá por su email
y le mostrará el panel de cajero en lugar del panel de cliente.
Esto es comportamiento esperado — Carlos lo resuelve en una próxima
actualización. No es un bug de tu lado.

---

## 13. Flujo de trabajo en GitHub

- Trabaja **solo en la rama `web`** — nunca hagas push directo a `main`
- Cuando tengas algo listo para revisión, crea un **Pull Request** hacia `main`
- Carlos revisa, aprueba y hace el merge
- El deploy al servidor lo hace Carlos — tú no tienes acceso al VPS
