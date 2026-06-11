# Backend - Delistars Menu Magic

API REST para el sistema de menú de Delistars.

## Arquitectura

El proyecto utiliza una **arquitectura modular en capas**:

```
src/
├── config/          # Configuración global (DB, env, etc)
├── middleware/      # Middlewares globales
├── utils/           # Utilidades y helpers
├── modules/         # Módulos de negocio
│   ├── auth/        # Módulo de autenticación
│   ├── products/    # Módulo de productos
│   ├── cart/        # Módulo de carrito
│   └── orders/      # Módulo de pedidos
└── app.ts           # Punto de entrada
```

### Estructura por Módulo

Cada módulo (auth, products, cart, orders) contiene:

- **controllers/** - Manejo de requests/responses
- **services/** - Lógica de negocio
- **repositories/** - Acceso a datos
- **routes/** - Definición de rutas
- **models/** - Esquemas de BD (Mongoose)
- **dto/** - Data Transfer Objects (validación)
- **interfaces/** - Interfaces TypeScript

## Instalación

```bash
npm install
```

## Variables de Entorno

Copia `.env.example` a `.env` y configura:

```bash
cp .env.example .env
```

## Desarrollo

```bash
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Testing

```bash
npm test
npm run test:watch
```

## Patrones de Arquitectura

- **Separación de responsabilidades**: Cada capa tiene una función específica
- **Inyección de dependencias**: Facilita testing y escalabilidad
- **DTOs**: Validación de datos en entrada
- **Repositorio pattern**: Abstracción de acceso a datos
- **Services pattern**: Lógica de negocio reutilizable
