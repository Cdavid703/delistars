import { readFileSync } from 'fs';
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin del servidor. Las credenciales salen de
 * GOOGLE_APPLICATION_CREDENTIALS (cuenta de servicio montada en /secrets).
 * Sin credencial con permiso de escritura, las rutas de pedidos responden 503.
 */
export function firebaseApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID, ...cuentaDeServicio() });
}

/**
 * Si la credencial es una cuenta de servicio con llave, se carga directo: así
 * los custom tokens (Microsoft, Apple Watch) se firman aquí mismo. Con la
 * credencial «por defecto» el SDK los firma por IAM (signBlob), un permiso que
 * la cuenta de servicio no tiene.
 */
function cuentaDeServicio() {
  const ruta = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!ruta) return {};
  try {
    const d = JSON.parse(readFileSync(ruta, 'utf8'));
    return d?.type === 'service_account' && d.private_key ? { credential: cert(d) } : {};
  } catch {
    return {};
  }
}

export function firestore(): Firestore {
  return getFirestore(firebaseApp());
}

/** La API de pedidos solo atiende donde se activó (PEDIDOS_API=1): hoy, pruebas. */
export const pedidosApiActiva = (): boolean => process.env.PEDIDOS_API === '1';
