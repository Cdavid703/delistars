# Arquitectura del Backend - Modular en Capas

## Estructura de Carpetas

```
back/
├── src/
│   ├── config/              ← Configuración global
│   ├── middleware/          ← Middlewares globales
│   ├── utils/               ← Utilidades y helpers
│   ├── interfaces/          ← Interfaces globales
│   │
│   ├── modules/             ← Módulos de negocio
│   │   ├── modulo_auth/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── routes/
│   │   │   └── models/
│   │   │       ├── dto/
│   │   │       └── entities/
│   │   │
│   │   ├── modulo_products/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── routes/
│   │   │   └── models/
│   │   │       ├── dto/
│   │   │       └── entities/
│   │   │
│   │   ├── modulo_cart/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── routes/
│   │   │   └── models/
│   │   │       ├── dto/
│   │   │       └── entities/
│   │   │
│   │   └── modulo_orders/
│   │       ├── controllers/
│   │       ├── services/
│   │       ├── repositories/
│   │       ├── routes/
│   │       └── models/
│   │           ├── dto/
│   │           └── entities/
│   │
│   └── app.ts               ← Punto de entrada
│
├── dist/                    ← Output compilado
├── .env                     ← Variables de entorno
├── .env.example             ← Plantilla
├── tsconfig.json
├── package.json
└── README.md
```

---

## Flujo de Datos por Capas

```
REQUEST HTTP
    ↓
ROUTE (routes/module.routes.ts)
    ↓
CONTROLLER (controllers/module.controller.ts)
    ↓
DTO - Validación de entrada
    ↓
SERVICE (services/module.service.ts) - Lógica de negocio
    ↓
REPOSITORY (repositories/module.repository.ts) - Query BD
    ↓
ENTITY (models/entities/) - Modelo de datos
    ↓
RESPONSE HTTP
```

---

## Responsabilidad de Cada Capa

### 📍 **Routes**
- Define endpoints HTTP (GET, POST, PUT, DELETE)
- Mapea peticiones a controladores

```typescript
router.post('/', (req, res, next) => controller.create(req, res, next));
```

### 🎮 **Controllers**
- Recibe petición HTTP
- Extrae datos (body, params, query)
- Llama a services
- Retorna respuesta

```typescript
async create(req: Request, res: Response, next: NextFunction) {
  const product = await service.create(req.body);
  ApiResponse.created(res, product);
}
```

### ⚙️ **Services**
- Lógica de negocio
- Valida reglas
- Llama a repositories
- **No conoce HTTP**

```typescript
async create(dto: CreateProductDto) {
  if (dto.price < 0) throw new ValidationError('...');
  return repository.create(dto);
}
```

### 🗄️ **Repositories**
- Acceso a Base de Datos
- CRUD operations
- **No contiene lógica**

```typescript
async create(data: IProduct) {
  return Product.create(data);
}
```

### 📝 **DTOs** (en models/dto/)
- Validación de entrada
- Transformación de datos

```typescript
class CreateProductDto {
  name!: string;
  price!: number;
}
```

### 📊 **Entities** (en models/entities/)
- Modelos/Interfaces de datos

```typescript
interface IProduct {
  _id?: string;
  name: string;
  price: number;
}
```

---

## Ejemplo Completo: POST /api/v1/products

### 1. Route recibe request
```typescript
// modulo_products/routes/products.routes.ts
router.post('/', (req, res, next) => controller.create(req, res, next));
```

### 2. Controller procesa
```typescript
// modulo_products/controllers/products.controller.ts
async create(req: Request, res: Response, next: NextFunction) {
  const dto = req.body; // { name: "Pizza", price: 15 }
  const product = await service.create(dto);
  ApiResponse.created(res, product);
}
```

### 3. Service valida y ejecuta
```typescript
// modulo_products/services/products.service.ts
async create(dto: CreateProductDto) {
  if (dto.price <= 0) throw new ValidationError('Price must be positive');
  return this.repository.create(dto);
}
```

### 4. Repository guarda en BD
```typescript
// modulo_products/repositories/products.repository.ts
async create(data: IProduct) {
  return Product.create(data);
}
```

### 5. Response al cliente
```json
{
  "success": true,
  "data": { "_id": "123", "name": "Pizza", "price": 15 },
  "message": "Resource created successfully",
  "timestamp": "2026-04-30T14:30:00Z"
}
```

---

## Agregar un Nuevo Módulo

### Pasos para `modulo_payments`:

1. **Crear carpetas**
```bash
mkdir -p src/modules/modulo_payments/{controllers,services,repositories,routes,models/{dto,entities}}
```

2. **Crear Entity** → `models/entities/payment.entity.ts`
3. **Crear DTO** → `models/dto/payment.dto.ts`
4. **Crear Repository** → `repositories/payment.repository.ts`
5. **Crear Service** → `services/payment.service.ts`
6. **Crear Controller** → `controllers/payment.controller.ts`
7. **Crear Routes** → `routes/payment.routes.ts`
8. **Registrar en app.ts**

```typescript
import paymentRoutes from '@modules/modulo_payments/routes/payment.routes';
app.use(`${apiPrefix}/payments`, paymentRoutes);
```

---

## Ventajas

✅ Escalable - Agregar módulos es fácil
✅ Mantenible - Responsabilidades claras
✅ Testeable - Capas independientes  
✅ Reutilizable - Services y repos reutilizables
✅ Documentado - Estructura clara

---

## Módulos Actuales

- **modulo_auth** - Autenticación (login, register)
- **modulo_products** - Gestión de productos
- **modulo_cart** - Carrito de compras
- **modulo_orders** - Órdenes/Pedidos

---

## Próximos Pasos

1. ✅ Estructura modular creada
2. ⏭️ Conectar MongoDB
3. ⏭️ Crear modelos Mongoose
4. ⏭️ Implementar JWT
5. ⏭️ Completar servicios
6. ⏭️ Tests unitarios
