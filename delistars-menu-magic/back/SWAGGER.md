# 📚 Swagger API Documentation

Accede a la documentación interactiva de la API en:

```
http://localhost:3000/api-docs
```

## 🚀 Características

- ✅ Documentación automática de todos los endpoints
- ✅ Interfaz interactiva para probar requests
- ✅ Esquemas de datos detallados
- ✅ Ejemplos de respuestas
- ✅ Autenticación con Bearer Token

## 📖 Endpoints Documentados

### Health
- `GET /health` - Verifica que el servidor esté activo

### Auth (Autenticación)
- `POST /api/v1/auth/login` - Login de usuario
- `POST /api/v1/auth/register` - Registro de nuevo usuario
- `POST /api/v1/auth/refresh` - Refresh de access token

### Products (Productos)
- `GET /api/v1/products` - Listar todos los productos
- `GET /api/v1/products/:id` - Obtener un producto
- `POST /api/v1/products` - Crear producto (admin)
- `PUT /api/v1/products/:id` - Actualizar producto (admin)
- `DELETE /api/v1/products/:id` - Eliminar producto (admin)

### Cart (Carrito)
- `GET /api/v1/cart` - Obtener carrito del usuario
- `POST /api/v1/cart/items` - Agregar item al carrito
- `DELETE /api/v1/cart/items/:itemId` - Eliminar item del carrito
- `PUT /api/v1/cart` - Actualizar carrito
- `DELETE /api/v1/cart` - Vaciar carrito

### Orders (Pedidos)
- `GET /api/v1/orders` - Listar mis pedidos
- `GET /api/v1/orders/:id` - Obtener un pedido
- `POST /api/v1/orders` - Crear nuevo pedido
- `PUT /api/v1/orders/:id` - Actualizar estado del pedido
- `DELETE /api/v1/orders/:id` - Cancelar pedido

## 🔐 Autenticación

Para endpoints protegidos, necesitas incluir el token JWT en el header:

```
Authorization: Bearer <tu_access_token>
```

### En Swagger:

1. Haz login en `/api/v1/auth/login`
2. Copia el `access_token` de la respuesta
3. Haz click en el botón "Authorize" (arriba a la derecha)
4. Pega el token en el campo `Authorization: Bearer`
5. Haz click en "Authorize"

## 📝 Documentar nuevos endpoints

### Ejemplo de endpoint GET

```typescript
/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     tags:
 *       - Products
 *     summary: Listar todos los productos
 *     description: Obtiene una lista paginada de productos
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items por página
 *     responses:
 *       200:
 *         description: Lista de productos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 */
router.get('/', (req, res, next) => productsController.getAll(req, res, next));
```

### Ejemplo de endpoint POST con autenticación

```typescript
/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Crear nuevo producto
 *     description: Solo administradores pueden crear productos
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductDto'
 *     responses:
 *       201:
 *         description: Producto creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 */
router.post('/', (req, res, next) => productsController.create(req, res, next));
```

## 🏗️ Estructura de schemas

Los schemas están definidos en `src/config/swagger.ts` bajo `components.schemas`.

Para usar un schema existente en tu documentación:

```typescript
$ref: '#/components/schemas/Product'
```

Para crear un nuevo schema, agrégalo en `src/config/swagger.ts`:

```typescript
schemas: {
  MySchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
  },
}
```

## 🔄 Actualizar Swagger

Después de agregar nuevos endpoints o schemas:

1. Reinicia el servidor: `npm run dev`
2. Abre http://localhost:3000/api-docs
3. Los cambios aparecerán automáticamente

## 📌 Notas importantes

- La documentación se genera automáticamente desde los comentarios JSDoc/Swagger
- Los schemas en `config/swagger.ts` son reutilizables con `$ref`
- Siempre incluye `tags` para organizar los endpoints
- Especifica `security` si el endpoint requiere autenticación
- Los `responses` deben incluir todos los códigos de estado posibles
