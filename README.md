# 🌟 DeliStars — Plataforma de Domicilios

Aplicación web fullstack para la gestión de pedidos a domicilio de una tienda de comida. Incluye un panel de órdenes en tiempo real, gestión de roles (cajeros y domiciliarios) y un módulo independiente de vacantes con carga de hojas de vida.

🌐 **Desplegado en producción:** [delistars.com](http://delistars.com)

-----

## 🚀 Tecnologías

|Capa          |Tecnología                      |
|--------------|--------------------------------|
|Lenguajes base|HTML5, CSS3, JavaScript (ES6+)  |
|UI Library    |React 19                        |
|Bundler       |Vite                            |
|Enrutamiento  |React Router DOM v7             |
|Estilos       |Tailwind CSS                    |
|Base de datos |Firebase Firestore (tiempo real)|
|Almacenamiento|Firebase Storage                |
|Servidor      |nginx en Debian (VPS propio)    |
|Íconos        |Lucide React                    |
|Fechas        |date-fns                        |
|Linting       |ESLint                          |

-----

## ✨ Funcionalidades

### 🛵 Módulo de Domicilios

- Registro y seguimiento de pedidos en tiempo real con Firestore
- Gestión de roles diferenciados: cajeros y domiciliarios
- Panel de control por rol con vistas personalizadas
- Actualización de estado de órdenes en tiempo real

### 📋 Módulo de Vacantes

- Portal independiente para postulaciones de empleo
- Carga de hojas de vida directamente a Firebase Storage
- Registro de postulantes en Firestore (`vacantes_postulantes`)
- Build y despliegue separado del módulo principal

-----

## 🏗️ Arquitectura

El proyecto maneja **dos builds independientes** con configuraciones de Vite separadas:

```
npm run dev              # Plataforma de domicilios → localhost:5173
npm run dev:vacantes     # Módulo de vacantes      → localhost:5173/vacantes/
```

```
npm run build            # → dist/
npm run build:vacantes   # → dist-vacantes/
```

Ambos módulos se despliegan en el mismo servidor nginx bajo el mismo dominio.

-----

## 🗄️ Estructura de Firestore

|Colección             |Descripción                           |
|----------------------|--------------------------------------|
|`orders`              |Pedidos y su estado                   |
|`roles_cashiers`      |Usuarios con rol de cajero            |
|`roles_drivers`       |Usuarios con rol de domiciliario      |
|`config`              |Configuración general de la plataforma|
|`vacantes_postulantes`|Postulantes al módulo de empleo       |

-----

## 📁 Estructura del Proyecto

```
delistars/
├── src/               # Código fuente principal (domicilios)
├── public/            # Assets estáticos
├── scripts/           # Scripts de postbuild
├── vacantes.html      # Entry point del módulo de vacantes
├── vite.config.js     # Config principal
├── vite.vacantes.config.js  # Config del módulo de vacantes
└── DEPLOY.md          # Guía de despliegue
```

-----

## ⚙️ Instalación local

```bash
# Clonar repositorio
git clone https://github.com/Cdavid703/delistars.git
cd delistars

# Instalar dependencias
npm install

# Iniciar en desarrollo
npm run dev
```

> ⚠️ Requiere configurar las variables de entorno de Firebase. Crear un archivo `.env` con las credenciales del proyecto `delistars-domicilios`.

-----

## 👤 Autor

**David Jaramillo** — Ingeniero Industrial | Automatización & Desarrollo Web  
📧 [cdavid.jaramillo@gmail.com](mailto:cdavid.jaramillo@gmail.com)  
🐙 [github.com/Cdavid703](https://github.com/Cdavid703)
