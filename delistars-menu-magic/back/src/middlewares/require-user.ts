import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp, firestore } from '../config/firestore';

/**
 * Quién llama (token de Firebase en `Authorization: Bearer <idToken>`).
 * Los roles replican la web (src/services/roles.js → getAllRoles) y
 * firestore.rules: listas fijas + colecciones roles_cashiers / roles_drivers /
 * roles_marketing, y una baja (roles_disabled) anula caja, domiciliario y
 * mercadeo (no al admin). Mantener en sync con admin/src/lib/team.ts.
 *
 * Sedes: el documento del rol puede traer `sedes: ['santa_lucia', ...]` (lo
 * escribe la aprobación de una solicitud). Sin ese campo, o en las listas
 * fijas, la persona puede trabajar en las dos sedes.
 */
export interface Usuario {
  uid: string;
  email: string;
  anonimo: boolean;
  nombre: string;
  esAdmin: boolean;
  esCaja: boolean;
  esDomiciliario: boolean;
  esMercadeo: boolean;
  /** Cómo entró: 'google.com', 'microsoft.com', 'password', 'anonymous'… */
  proveedor: string;
  /** Correo confirmado (las cuentas de correo y contraseña lo exigen para pedir). */
  correoVerificado: boolean;
  /** Sedes autorizadas por rol (vacío = no tiene ese rol). */
  sedes: { caja: string[]; domiciliario: string[] };
  /** Cuándo inició sesión por última vez (ms): acciones delicadas piden que sea reciente. */
  autenticadoAt: number;
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
const MERCADEO = ['valenthina5431@gmail.com'];
export const TODAS_LAS_SEDES = ['santa_lucia', 'santa_teresita'];

/** Sedes de un rol: listas fijas → todas; documento → su campo `sedes` o todas. */
async function sedesDeRol(coleccion: string, email: string, fijos: string[]): Promise<string[]> {
  if (!email) return [];
  if (fijos.includes(email)) return TODAS_LAS_SEDES;
  const snap = await firestore().doc(`${coleccion}/${email}`).get();
  if (!snap.exists) return [];
  const s = snap.data()?.sedes;
  return Array.isArray(s) && s.length ? s.filter((x: string) => TODAS_LAS_SEDES.includes(x)) : TODAS_LAS_SEDES;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Falta token de autenticación' });
  try {
    const d = await getAuth(firebaseApp()).verifyIdToken(token);
    const email = (d.email || '').toLowerCase();
    const db = firestore();
    const [baja, sedesCaja, sedesDom, mercadeoDinamico] = email
      ? await Promise.all([
        db.doc(`roles_disabled/${email}`).get().then((x) => x.exists),
        sedesDeRol('roles_cashiers', email, CAJEROS),
        sedesDeRol('roles_drivers', email, DOMICILIARIOS),
        MERCADEO.includes(email) ? true : db.doc(`roles_marketing/${email}`).get().then((x) => x.exists),
      ])
      : [false, [], [], false];
    const caja = baja ? [] : sedesCaja;
    const dom = baja ? [] : sedesDom;
    req.usuario = {
      uid: d.uid,
      email,
      anonimo: d.firebase?.sign_in_provider === 'anonymous',
      nombre: (d.name as string) || '',
      esAdmin: ADMINS.includes(email),
      esCaja: caja.length > 0,
      esDomiciliario: dom.length > 0,
      esMercadeo: !baja && !!mercadeoDinamico,
      proveedor: d.firebase?.sign_in_provider || '',
      correoVerificado: d.email_verified === true,
      sedes: { caja, domiciliario: dom },
      autenticadoAt: Number(d.auth_time || 0) * 1000,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
