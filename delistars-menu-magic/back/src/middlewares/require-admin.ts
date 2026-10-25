import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp } from '../config/firestore';

// Una sola inicialización (con la cuenta de servicio si la hay): ver config/firestore.ts.
firebaseApp();

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta token de autenticación' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();

    if (!email || !adminEmails.includes(email)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
