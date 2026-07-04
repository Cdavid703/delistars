// Cliente del backend de pagos Wompi (ver PLAN-WOMPI.md).
// El backend es quien firma el checkout (secreto de integridad) y quien
// verifica transacciones contra Wompi — el navegador nunca toca secretos y
// la palabra final sobre "pagado" siempre la da la verificación del backend.
import { auth } from './firebase'

const API = import.meta.env.VITE_API_URL || '/api/v1'

async function authFetch(path, opts = {}) {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Error ${res.status}`)
  }
  return body.data
}

/** Crea la sesión de checkout (referencia + firma). simulated=true => sin cuenta Wompi aún. */
export const createWompiSession = (orderId, amountInCents, redirectUrl) =>
  authFetch('/payments/wompi/session', {
    method: 'POST',
    body: JSON.stringify({ orderId, amountInCents, redirectUrl }),
  })

/** Estado REAL de la transacción según Wompi (o el simulador en desarrollo). */
export const verifyWompiTransaction = (transactionId) =>
  authFetch(`/payments/wompi/verify/${encodeURIComponent(transactionId)}`)

/** COP → centavos (Wompi trabaja en centavos). */
export const toCents = (cop) => Math.round(Number(cop || 0) * 100)

/** ¿La transacción verificada corresponde a ESTE pedido con ESTE total? */
export const matchesOrder = (tx, orderId, totalPrice) =>
  tx?.status === 'APPROVED' &&
  typeof tx.reference === 'string' &&
  tx.reference.startsWith(orderId) &&
  tx.amountInCents === toCents(totalPrice)
