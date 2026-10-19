import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp, firestore } from '../config/firestore';

/**
 * Quién llama (token de Firebase en `Authorization: Bearer <idToken>`).
 * Los roles replican firestore.rules (isAdmin / isCashier / isDriver):
 * listas fijas + colecciones roles_cashiers / roles_drivers. Mantener en sync.
 */
export interface Usuario {
  uid: string;
  email: string;
  anonimo: boolean;
  nombre: string;
  esAdmin: boolean;
  esCaja: boolean;
  esDomiciliario: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { usuario?: Usuario }
  }
}

const ADMINS = ['thebesta4321@gmail.com', 'cdavid.jaramillo@gmail.com'];
const CAJEROS = ['lluis02martinez@gmail.com', 'vvillegasmazo@gmail.com', 'cdavid.jaramillo@gmail.com', 'thebesta4321@gmail.com'];
const DOMICILIARIOS = ['cdavid.jaramillo@gmail.com'];

async function existe(coleccion: string, email: string): Promise<boolean> {
  if (!email) return false;
  const snap = await firestore().doc(`${coleccion}/${email}`).get();
  return snap.exists;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Falta token de autenticación' });
  try {
    const d = await getAuth(firebaseApp()).verifyIdToken(token);
    const email = (d.email || '').toLowerCase();
    const [cajaDinamica, domDinamico] = await Promise.all([
      CAJEROS.includes(email) ? true : existe('roles_cashiers', email),
      DOMICILIARIOS.includes(email) ? true : existe('roles_drivers', email),
    ]);
    req.usuario = {
      uid: d.uid,
      email,
      anonimo: d.firebase?.sign_in_provider === 'anonymous',
      nombre: (d.name as string) || '',
      esAdmin: ADMINS.includes(email),
      esCaja: cajaDinamica,
      esDomiciliario: domDinamico,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
