import 'reflect-metadata';
import path from 'path';
import dotenv from 'dotenv';

// ⚠️ Cargar variables de entorno PRIMERO
const envPath = path.resolve(process.cwd(), '.env');
console.log(`📁 Buscando .env en: ${envPath}`);
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(`⚠️ Advertencia al cargar .env: ${envResult.error.message}`);
} else {
  console.log(`✅ .env cargado exitosamente`);
}

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

// Import config
import { connectDB } from './config/database';
import { swaggerSpec } from './config/swagger';

// Import routes
import productsRoutes from './modules/modulo_products/routes/products.routes';
import categoriesRoutes from './modules/modulo_categories/routes/categories.routes';
import sedesRoutes from './modules/modulo_sedes/routes/sede.routes';
import trabajadoresRoutes from './modules/modulo_trabajador/routes/trabajador.routes';

const app: Express = express();

// Detrás del gateway nginx (y del nginx del host): confía en los proxies para
// que req.ip y el rate-limit usen la IP real del cliente, no la del proxy.
// Nº de saltos configurable (1 = solo gateway Docker; 2 = host nginx + gateway).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation — solo fuera de producción (no filtrar la API en prod)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.topbar { display: none }',
    customSiteTitle: 'Delistars Menu Magic - API Documentation',
    swaggerOptions: {
      url: '/swagger.json',
    },
  }));

  app.get('/swagger.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Health check del servidor
 *     description: Verifica que el servidor esté corriendo correctamente
 *     responses:
 *       200:
 *         description: Servidor activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// API Routes
const apiPrefix = process.env.API_PREFIX || '/api/v1';

app.use(`${apiPrefix}/products`, productsRoutes);
app.use(`${apiPrefix}/categories`, categoriesRoutes);
app.use(`${apiPrefix}/sedes`, sedesRoutes);
app.use(`${apiPrefix}/trabajadores`, trabajadoresRoutes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: err.status || 500,
  });
});

const PORT = process.env.PORT || 3000;

/**
 * Iniciar servidor
 */
async function startServer() {
  try {
    // Conectar a la base de datos
    await connectDB();

    app.listen(PORT, () => {
      console.log('\n✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ 🚀 SERVIDOR INICIADO CORRECTAMENTE');
      console.log('✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      console.log('🔧 Configuración del servidor:');
      console.log(`   • URL: http://localhost:${PORT}`);
      console.log(`   • API prefix: ${apiPrefix}`);
      console.log(`   • Environment: ${process.env.NODE_ENV}`);
      console.log(`   • Puerto: ${PORT}\n`);
      
      console.log('📚 Endpoints disponibles:');
      console.log(`   • ${apiPrefix}/health - Health check`);
      console.log(`   • ${apiPrefix}/products - Productos`);
      console.log(`   • ${apiPrefix}/categories - Categorías`);
      console.log(`   • ${apiPrefix}/sedes - Sedes`);
      console.log(`   • ${apiPrefix}/trabajadores - Trabajadores\n`);
    });
  } catch (error) {
    console.error('\n❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR AL INICIAR EL SERVIDOR');
    console.error('❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.error('Detalles:', error, '\n');
    process.exit(1);
  }
}

// Iniciar servidor
startServer();

export default app;
