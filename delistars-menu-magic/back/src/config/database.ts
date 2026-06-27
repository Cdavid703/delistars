import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * Configuración de conexión a PostgreSQL con TypeORM
 * Se crea dinámicamente cuando se llama connectDB()
 */
let AppDataSource: DataSource | null = null;

/**
 * Conectar a la base de datos PostgreSQL
 */
export async function connectDB(): Promise<void> {
  const startTime = Date.now();
  
  // Log de variables de entorno
  console.log('\n📝 Variables de entorno detectadas:');
  console.log(`   DB_HOST: ${process.env.DB_HOST}`);
  console.log(`   DB_PORT: ${process.env.DB_PORT}`);
  console.log(`   DB_USERNAME: ${process.env.DB_USERNAME}`);
  console.log(`   DB_PASSWORD: ${process.env.DB_PASSWORD ? '****' : '(vacío)'}`);
  console.log(`   DB_NAME: ${process.env.DB_NAME}\n`);
  
  try {
    console.log('🔄 Iniciando conexión a PostgreSQL...\n');
    
    // Crear DataSource dinámicamente con las variables de entorno actualizadas
    AppDataSource = new DataSource({
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'delistars',
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
      entities: ['src/modules/**/models/entities/*.{ts,js}'],
      migrations: ['src/migrations/*.{ts,js}'],
      subscribers: [],
      ssl: false,
    });
    
    await AppDataSource.initialize();
    
    const connectionTime = Date.now() - startTime;
    
    console.log('✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 📦 CONEXIÓN A BASE DE DATOS ESTABLECIDA');
    console.log('✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📊 Detalles de la conexión:');
    console.log(`   • Base de datos: ${process.env.DB_NAME}`);
    console.log(`   • Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`   • Usuario: ${process.env.DB_USERNAME}`);
    console.log(`   • Ambiente: ${process.env.NODE_ENV}`);
    console.log(`   • Tiempo de conexión: ${connectionTime}ms\n`);
  } catch (error) {
    console.error('\n❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR AL CONECTAR A POSTGRESQL');
    console.error('❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.error('📍 Detalles del error:', error);
    console.error('\n💡 Verifica:');
    console.error('   • Las credenciales en .env (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD)');
    console.error('   • Que PostgreSQL esté corriendo en localhost:5432');
    console.error('   • Que la base de datos exista\n');
    process.exit(1);
  }
}

/**
 * Desconectar de la base de datos PostgreSQL
 */
export async function disconnectDB(): Promise<void> {
  try {
    if (AppDataSource && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('\n⛔ Conexión a PostgreSQL cerrada correctamente');
    }
  } catch (error) {
    console.error('❌ Error desconectando de PostgreSQL:', error);
    throw error;
  }
}

/**
 * Obtener la instancia de DataSource
 */
export function getDataSource(): DataSource {
  if (!AppDataSource) {
    throw new Error('DataSource no inicializado. Llama a connectDB() primero.');
  }
  return AppDataSource;
}

export default AppDataSource;
