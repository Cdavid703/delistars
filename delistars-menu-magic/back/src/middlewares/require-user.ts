import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp, firestore } from '../config/firestore';
import { cuentaRevocada, sesionRelojActiva } from '../modules/modulo_auth/reloj.service';

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
  /** Id de la sesión del Apple Watch (sesiones_reloj/{id}) o null si no es un reloj. */
  reloj: string | null;
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
    // W-2: sesión revocada (cerrar sesión en todos lados, cuenta deshabilitada o
    // borrada) → fuera, aunque el token no haya vencido. Si la consulta a Firebase
    // falla, no se tumba el servicio: la firma del token ya se verificó.
    const revocada = await cuentaRevocada(d.uid, Number(d.auth_time || 0)).catch((e) => {
      console.warn('[auth] no se pudo revisar la revocación:', (e as Error)?.message || e);
      return false;
    });
    // W-1: sesión del Apple Watch. Vale mientras su registro siga activo.
    const reloj = typeof d.reloj === 'string' ? d.reloj : null;
    if (revocada || (reloj && !(await sesionRelojActiva(reloj, d.uid)))) {
      return res.status(401).json({ error: 'La sesión se cerró. Vuelve a entrar', codigo: 'sesion_cerrada' });
    }
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
    // El reloj solo actúa como cliente: sin roles del equipo y sin «ingreso
    // reciente» (borrar la cuenta y lo delicado se hacen desde el iPhone).
    req.usuario = {
      uid: d.uid,
      email,
      anonimo: d.firebase?.sign_in_provider === 'anonymous',
      nombre: (d.name as string) || '',
      esAdmin: !reloj && ADMINS.includes(email),
      esCaja: !reloj && caja.length > 0,
      esDomiciliario: !reloj && dom.length > 0,
      esMercadeo: !reloj && !baja && !!mercadeoDinamico,
      proveedor: reloj ? String(d.prov || 'custom') : d.firebase?.sign_in_provider || '',
      correoVerificado: d.email_verified === true,
      sedes: reloj ? { caja: [], domiciliario: [] } : { caja, domiciliario: dom },
      autenticadoAt: reloj ? 0 : Number(d.auth_time || 0) * 1000,
      reloj,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
