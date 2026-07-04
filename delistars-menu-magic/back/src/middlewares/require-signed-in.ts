import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

// Extiende Request con el uid del usuario autenticado.
export interface SignedInRequest extends Request {
  uid?: string;
}

// Cualquier usuario con sesión de Firebase (incluye clientes anónimos e
// invitados). Menos estricto que require-admin: se usa para operaciones del
// flujo del cliente que necesitan backend (ej. firmar el checkout de Wompi)
// pero no deben quedar abiertas a internet sin ninguna autenticación.
export async function requireSignedIn(req: SignedInRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta token de autenticación' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
