// Bajas de las campañas de correo: "no quiero recibir más promociones".
//
// Cada correo trae un enlace /api/v1/mercadeo/baja?u=<uid>&t=<firma>. La firma
// es un HMAC del uid con MERCADEO_SECRET (lo comparten este backend y el
// scheduler, que es quien envía): así nadie puede dar de baja a otro
// inventando enlaces. La baja se guarda aquí, en Postgres (el backend no
// escribe en Firestore), y el scheduler las consulta antes de cada envío.
import { createHmac, timingSafeEqual } from 'crypto';
import { getDataSource } from '../../../config/database';

const secreto = () => process.env.MERCADEO_SECRET || '';

/** Firma corta del uid (la misma que calcula el scheduler). */
export function firmar(uid: string, clave = secreto()): string {
  return createHmac('sha256', clave).update(uid).digest('base64url').slice(0, 22);
}

export function firmaValida(uid: unknown, firma: unknown, clave = secreto()): boolean {
  if (!clave || typeof uid !== 'string' || typeof firma !== 'string') return false;
  if (!/^[\w-]{6,128}$/.test(uid)) return false;
  const esperada = Buffer.from(firmar(uid, clave));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await getDataSource().query(`
    CREATE TABLE IF NOT EXISTS mercadeo_bajas (
      uid   VARCHAR(128) PRIMARY KEY,
      fecha TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  tablaLista = true;
}

export async function registrarBaja(uid: string): Promise<void> {
  await asegurarTabla();
  await getDataSource().query(
    'INSERT INTO mercadeo_bajas (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING', [uid]);
}

export async function listarBajas(): Promise<string[]> {
  await asegurarTabla();
  const filas: { uid: string }[] = await getDataSource().query('SELECT uid FROM mercadeo_bajas');
  return filas.map((f) => f.uid);
}
