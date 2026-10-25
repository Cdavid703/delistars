import { createHash, randomBytes } from 'crypto';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import type { PedidoDoc } from '../reglas/transiciones';
import { enlaceVigente, vistaDestinatario } from '../../../shared/destinatario';

/**
 * Enlace de quien recibe un pedido para otra persona (§7.3). Se guarda:
 *  - en el pedido: `destinatario.token` (lo ven el comprador, la caja y el
 *    domiciliario, que pueden leer el pedido);
 *  - en `enlaces_destinatario/{sha256(token)}` → { orderId }, para buscarlo
 *    (solo el servidor toca esa colección: las reglas la niegan a todos).
 * El token tiene 144 bits al azar: no se puede adivinar probando.
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const nuevoTokenDestinatario = () => randomBytes(18).toString('base64url');

export const indiceDestinatario = (token: string) => firestore().doc(`enlaces_destinatario/${sha(token)}`);

const FORMA = /^[A-Za-z0-9_-]{24}$/;

/** Lo que ve quien recibe con su enlace (sin cuenta). Vence 3 h después de terminar. */
export async function verComoDestinatario(token: unknown) {
  const invalido = new ErrorPedido('enlace_invalido', 'Este enlace no es válido. Pídele a quien te mandó el pedido que te lo comparta de nuevo', 404);
  if (typeof token !== 'string' || !FORMA.test(token)) throw invalido;
  const id = (await indiceDestinatario(token).get()).data()?.orderId as string | undefined;
  const snap = id ? await firestore().doc(`orders/${id}`).get() : null;
  const p = snap?.exists ? (snap.data() as PedidoDoc) : null;
  if (!id || !p || p.destinatario?.token !== token) throw invalido;
  if (!enlaceVigente(p)) throw new ErrorPedido('vencido', 'Este enlace ya venció: el pedido terminó hace más de 3 horas', 410);
  return vistaDestinatario(id, p);
}
