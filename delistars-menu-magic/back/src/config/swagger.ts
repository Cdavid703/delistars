import swaggerJSDoc from 'swagger-jsdoc';

/**
 * Definición de las opciones para Swagger
 */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Delistars Menu Magic API',
      version: '1.0.0',
      description: 'API REST para el sistema de menú de Delistars',
      contact: {
        name: 'Delistars',
        url: 'https://delistars.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}/api/v1`,
        description: 'Servidor de desarrollo',
      },
      {
        url: 'https://api.delistars.com/api/v1',
        description: 'Servidor de producción',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT para autenticación',
        },
      },
      schemas: {
        // User/Auth Schemas
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['customer', 'admin'] },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        // Product Schemas
        Category: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            icon: { type: 'string' },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number', format: 'decimal' },
            category_id: { type: 'string', format: 'uuid' },
            image: { type: 'string' },
            is_available: { type: 'boolean' },
            stock: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateProductDto: {
          type: 'object',
          required: ['name', 'description', 'price', 'category_id'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number', format: 'decimal', minimum: 0 },
            category_id: { type: 'string', format: 'uuid' },
            image: { type: 'string' },
            stock: { type: 'integer', default: 0 },
          },
        },

        // Cart Schemas
        CartItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            product_id: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1 },
            price: { type: 'number', format: 'decimal' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Cart: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
            total: { type: 'number', format: 'decimal' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        AddToCartDto: {
          type: 'object',
          required: ['product_id', 'quantity'],
          properties: {
            product_id: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1 },
          },
        },

        // Order Schemas
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] },
            total: { type: 'number', format: 'decimal' },
            address: { type: 'string' },
            notes: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateOrderDto: {
          type: 'object',
          required: ['total'],
          properties: {
            address: { type: 'string' },
            notes: { type: 'string' },
            total: { type: 'number', format: 'decimal', minimum: 0 },
          },
        },

        // Error Schemas
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
            error: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Auth',
        description: 'Autenticación y registro',
      },
      {
        name: 'Products',
        description: 'Gestión de productos',
      },
      {
        name: 'Cart',
        description: 'Gestión del carrito',
      },
      {
        name: 'Orders',
        description: 'Gestión de pedidos',
      },
    ],
  },
  apis: ['./src/modules/**/routes/*.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
