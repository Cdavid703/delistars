import { ErrorPedido } from './armado';
import type { PedidoDoc } from './transiciones';
import type { Usuario } from '../../../middlewares/require-user';
import { CANALES, motivoCerrado, revisarTexto } from '../../../shared/chat';
import { revisarFoto } from '../../../shared/fotos';

/**
 * Chats del pedido (especificación §8.3, Fase 7). Reglas puras, sin Firestore:
 * quién puede escribir en cada canal y cuándo sigue abierto.
 *
 *   caja          cliente del pedido ↔ caja (o admin) de la sede
 *   domiciliario  cliente del pedido ↔ domiciliario asignado (admin también)
 *
 * La caja NO escribe ni lee el canal del domiciliario: ese chat es entre quien
 * entrega y quien recibe. Administración sí, para resolver reclamos (§14).
 */
export type Canal = 'caja' | 'domiciliario';
export type RolMensaje = 'client' | 'cashier' | 'driver' | 'admin';

export interface Mensaje {
  role: RolMensaje;
  name: string;
  text: string;
  ts: number;
  /** Foto subida a fotos/{orderId}/ (el texto puede ir vacío). */
  foto?: { url: string; path: string };
}

const TEXTO_ERROR: Record<string, string> = {
  canal: 'Ese chat no existe',
  texto: 'Escribe algo antes de enviar',
  largo: 'El mensaje es muy largo (máximo 500 caracteres)',
  rechazado: 'Este pedido no siguió, así que el chat quedó cerrado',
  vencido: 'El chat se cierra 3 horas después de la entrega',
  sin_domiciliario: 'Este pedido todavía no tiene domiciliario',
  foto: 'La foto no se pudo adjuntar. Vuelve a elegirla',
};

/** Con qué papel escribe esta persona en este canal; null si no le toca. */
export function rolEnCanal(p: PedidoDoc, u: Usuario, canal: Canal): RolMensaje | null {
  const esCliente = !!p.clientUid && p.clientUid === u.uid;
  if (canal === 'caja') {
    if (esCliente) return 'client';
    if (u.esAdmin || u.esCaja) return 'cashier';
    return null;
  }
  if (esCliente) return 'client';
  const correo = (u.email || '').toLowerCase();
  if (p.driverEmail && String(p.driverEmail).toLowerCase() === correo) return 'driver';
  if (u.esAdmin) return 'admin';
  return null;
}

/** Valida canal, ventana, permiso y texto; devuelve el mensaje listo para guardar. */
export function validarMensaje(
  p: PedidoDoc, u: Usuario, canalCrudo: unknown, texto: unknown, ahora = Date.now(),
  adjunto: { foto?: unknown; orderId?: string; bucket?: string } = {},
): { canal: Canal; mensaje: Mensaje } {
  if (!CANALES.includes(canalCrudo as string)) throw new ErrorPedido('canal', TEXTO_ERROR.canal, 422);
  const canal = canalCrudo as Canal;
  const cerrado = motivoCerrado(p, canal, ahora);
  if (cerrado) throw new ErrorPedido(cerrado, TEXTO_ERROR[cerrado] || 'El chat está cerrado', 409);
  const role = rolEnCanal(p, u, canal);
  if (!role) throw new ErrorPedido('sin_permiso', canal === 'domiciliario' ? 'Este chat es entre el cliente y el domiciliario' : 'No puedes escribir en este chat', 403);
  // Con foto el texto es opcional (una foto sola es un mensaje).
  let foto: Mensaje['foto'];
  if (adjunto.foto != null) {
    const f = revisarFoto(adjunto.foto, adjunto.orderId, adjunto.bucket) as { error?: string; foto?: Mensaje['foto'] };
    if (f.error) throw new ErrorPedido('foto', TEXTO_ERROR.foto, 422);
    foto = f.foto;
  }
  const vacio = String(texto ?? '').trim() === '';
  const t = foto && vacio ? { texto: '' } : revisarTexto(texto) as { error?: string; texto?: string };
  if (t.error) throw new ErrorPedido(t.error, TEXTO_ERROR[t.error], 422);
  const name = u.nombre || (role === 'client' ? 'Cliente' : role === 'driver' ? 'Domiciliario' : role === 'admin' ? 'Administración' : 'Cajero');
  return { canal, mensaje: { role, name, text: t.texto as string, ts: ahora, ...(foto ? { foto } : {}) } };
}
