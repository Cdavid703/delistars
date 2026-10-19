import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin del servidor. Las credenciales salen de
 * GOOGLE_APPLICATION_CREDENTIALS (cuenta de servicio montada en /secrets).
 * Sin credencial con permiso de escritura, las rutas de pedidos responden 503.
 */
export function firebaseApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

export function firestore(): Firestore {
  return getFirestore(firebaseApp());
}

/** La API de pedidos solo atiende donde se activó (PEDIDOS_API=1): hoy, pruebas. */
export const pedidosApiActiva = (): boolean => process.env.PEDIDOS_API === '1';
