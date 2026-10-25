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
import rutasRoutes from './modules/modulo_rutas/routes/rutas.routes';
import mercadeoRoutes from './modules/modulo_mercadeo/routes/mercadeo.routes';
import campanasRoutes from './modules/modulo_mercadeo/routes/campanas.routes';
import pedidosRoutes from './modules/modulo_pedidos/routes/pedidos.routes';
import equipoRoutes from './modules/modulo_equipo/routes/equipo.routes';
import cuentaRoutes from './modules/modulo_cuenta/routes/cuenta.routes';
import authRoutes from './modules/modulo_auth/routes/auth.routes';
import avisosRoutes from './modules/modulo_avisos/routes/avisos.routes';
import reclamosRoutes from './modules/modulo_reclamos/routes/reclamos.routes';
import cuadresRoutes from './modules/modulo_cuadres/routes/cuadres.routes';
import impresionesRoutes from './modules/modulo_impresiones/routes/impresiones.routes';
import reportesRoutes from './modules/modulo_reportes/routes/reportes.routes';
import agotadosRoutes from './modules/modulo_agotados/routes/agotados.routes';
import { programarEliminaciones } from './modules/modulo_cuenta/cuenta.service';
import { pedidosApiActiva } from './config/firestore';

const app: Express = express();

// Detrás del gateway nginx (y del nginx del host): confía en los proxies para
// que req.ip refleje la IP real del cliente, no la del proxy.
// Nº de saltos configurable (1 = solo gateway Docker; 2 = host nginx + gateway).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// Middleware
// CORS: usar la lista de CORS_ORIGIN si está definida. Las apps se sirven
// same-origin tras el gateway (/api/ en el mismo dominio), así que no dependen
// de CORS; por eso en producción NO hacemos fallback a '*' (evita exponer la
// API a orígenes de terceros). En desarrollo sí se permite '*' por comodidad.
const corsOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !corsOrigins?.length) {
  console.warn('⚠️ CORS_ORIGIN no está definido en producción: se bloquean los orígenes cruzados.');
}

app.use(cors({
  origin: corsOrigins?.length
    ? corsOrigins
    : process.env.NODE_ENV === 'production'
      ? false
      : '*',
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
app.use(`${apiPrefix}/rutas`, rutasRoutes);
app.use(`${apiPrefix}/pedidos`, pedidosRoutes);
app.use(`${apiPrefix}/equipo`, equipoRoutes);
app.use(`${apiPrefix}/cuenta`, cuentaRoutes);
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/avisos`, avisosRoutes);
app.use(`${apiPrefix}/reclamos`, reclamosRoutes);
app.use(`${apiPrefix}/cuadres`, cuadresRoutes);
app.use(`${apiPrefix}/impresiones`, impresionesRoutes);
app.use(`${apiPrefix}/reportes`, reportesRoutes);
app.use(`${apiPrefix}/agotados`, agotadosRoutes);
app.use(`${apiPrefix}/mercadeo`, mercadeoRoutes);
app.use(`${apiPrefix}/mercadeo`, campanasRoutes);

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

    // Cuentas cuyo plazo de eliminación venció (Fase 4, P-25).
    if (pedidosApiActiva()) programarEliminaciones();

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
      console.log(`   • ${apiPrefix}/rutas/recorrido - Distancia por calle (Google)\n`);
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
