import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import { uidFirebaseDeMicrosoft, revisarClaims, perfilDe, Claims } from './reglas';

/** App de Azure «DeliStars» (id público; el mismo que usa Firebase para la web). */
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '816b4098-6d38-4a51-9f9a-38e8aa5951fb';
// Llaves públicas de Microsoft (cuentas de trabajo y personales). jose las guarda en caché.
const LLAVES = createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'));

const codigo = (e: unknown) => (e as { code?: string })?.code;

/**
 * { idToken, nonce } de Microsoft → { customToken } de Firebase de la misma
 * cuenta que esa persona usa con Microsoft en la web. Nunca une por correo: si
 * el correo ya es de otra cuenta (Google o contraseña), responde 409 como la web.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function entrarConMicrosoft(b: any) {
  if (typeof b?.idToken !== 'string' || b.idToken.length > 8000) throw new ErrorPedido('token_microsoft', 'Falta el token de Microsoft', 400);
  let claims: Claims;
  try {
    ({ payload: claims } = await jwtVerify(b.idToken, LLAVES, { audience: CLIENT_ID, algorithms: ['RS256'] }));
  } catch {
    throw new ErrorPedido('token_microsoft', 'El inicio de sesión con Microsoft no es válido o venció: vuelve a intentarlo', 401);
  }
  revisarClaims(claims, b?.nonce);
  const providerUid = uidFirebaseDeMicrosoft(claims.oid);
  const auth = getAuth(firebaseApp());

  let uid: string | null = null;
  try {
    uid = (await auth.getUserByProviderUid('microsoft.com', providerUid)).uid;
  } catch (e) {
    if (codigo(e) !== 'auth/user-not-found') throw e;
  }

  if (!uid) {
    const { email, nombre } = perfilDe(claims);
    if (email) {
      const yaExiste = await auth.getUserByEmail(email).then(() => true, (e) => {
        if (codigo(e) === 'auth/user-not-found') return false;
        throw e;
      });
      if (yaExiste) {
        throw new ErrorPedido('cuenta_con_otro_metodo',
          'Ese correo ya tiene cuenta en DeliStars con otro método (Google o correo y contraseña). Entra con ese método.', 409);
      }
    }
    const nuevo = await auth.createUser({ ...(email ? { email } : {}), ...(nombre ? { displayName: nombre } : {}) });
    // Queda vinculada a Microsoft: si después entra por la web, Firebase la reconoce.
    await auth.updateUser(nuevo.uid, {
      providerToLink: { providerId: 'microsoft.com', uid: providerUid, ...(email ? { email } : {}), ...(nombre ? { displayName: nombre } : {}) },
    });
    uid = nuevo.uid;
  }
  return { customToken: await auth.createCustomToken(uid) };
}
