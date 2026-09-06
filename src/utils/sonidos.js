// Sonidos de aviso de la aplicación.
//
// Antes cada panel tenía su propio pedacito de Web Audio y varios eventos
// pasaban callados: al cliente no le sonaba nada cuando le cotizaban o cuando
// el domiciliario llegaba, y a la caja no le sonaba cuando el domiciliario
// aceptaba o entregaba. Ahora los tres paneles usan este módulo y cada evento
// tiene su propia melodía, para poder distinguirlo sin mirar la pantalla.
//
// Lecciones que ya costaron caro en producción y que este módulo respeta:
//   · El navegador deja el AudioContext 'suspended' (o 'interrupted' en iOS)
//     cuando la pestaña pasa al fondo o se bloquea la pantalla — justo lo que
//     hace la caja entre pedido y pedido. Hay que DESPERTARLO y esperar a que
//     esté corriendo antes de programar los tonos; si no, se agendan en un
//     tiempo ya pasado y no suena nada, sin dar ningún error.
//   · Se reusa UN solo contexto. Crear uno por sonido hace que el navegador
//     deje de sonar del todo pasados unos cuantos.

const CLAVE_SILENCIO = 'ds_sonido_silenciado'

// ─── Catálogo de sonidos ──────────────────────────────────────────────────────
// Cada evento tiene una firma distinta: cambia la melodía, el timbre y el
// largo, para que se reconozca de oído sin mirar.
//   seq  — frecuencias en Hz, en orden
//   tipo — timbre del oscilador
//   vol  — volumen (0 a 1)
//   paso — segundos entre nota y nota
//   dur  — cuánto dura cada nota
export const SONIDOS = {
  // CAJA — entra un pedido. El más urgente: repite hasta que lo atiendan.
  nuevoPedido: { seq: [880, 1100, 880, 1100, 1320, 1100, 880], tipo: 'square', vol: 0.6, paso: 0.16, dur: 0.14 },
  // DOMICILIARIO — le asignaron un domicilio. Ascendente, llama la atención.
  asignado:    { seq: [880, 1100, 1320],            tipo: 'square', vol: 0.55, paso: 0.15, dur: 0.16 },
  // CLIENTE — le cotizaron el pedido: ya puede pagar. Dos notas brillantes.
  cotizado:    { seq: [784, 1046],                  tipo: 'sine',   vol: 0.5,  paso: 0.16, dur: 0.26 },
  // Confirmación corta y seca: la caja aceptó, o el domiciliario aceptó.
  aceptado:    { seq: [659, 880],                   tipo: 'triangle', vol: 0.45, paso: 0.1,  dur: 0.14 },
  // CLIENTE — el pedido salió. Tres notas subiendo, suave.
  enCamino:    { seq: [523, 659, 784],              tipo: 'sine',   vol: 0.45, paso: 0.13, dur: 0.2 },
  // CLIENTE — el domiciliario está en la puerta. Timbre de casa: hay que salir.
  llego:       { seq: [988, 784, 988, 784],         tipo: 'sine',   vol: 0.6,  paso: 0.22, dur: 0.34 },
  // Cierre: entregado. Descendente, "asunto resuelto".
  entregado:   { seq: [784, 659, 523],              tipo: 'sine',   vol: 0.4,  paso: 0.13, dur: 0.2 },
  // Algo se cayó: cancelado o rechazado. Grave y descendente.
  cancelado:   { seq: [440, 349, 262],              tipo: 'sawtooth', vol: 0.45, paso: 0.16, dur: 0.24 },
  // Ojo con esto: el cliente agregó productos, hay que recotizar.
  atencion:    { seq: [740, 740, 740],              tipo: 'triangle', vol: 0.5, paso: 0.12, dur: 0.12 },
  // Mensaje de chat. Doble ráfaga, distinta de todo lo demás.
  mensaje:     { seq: [880, 1100, 880],             tipo: 'sine',   vol: 0.55, paso: 0.14, dur: 0.18 },
}

// ─── Contexto de audio ────────────────────────────────────────────────────────
let ctx = null

function getCtx() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

/** Despierta el contexto y dice si quedó listo para sonar. */
export async function despertarAudio() {
  const c = getCtx()
  if (!c) return false
  if (c.state !== 'running') {
    try { await c.resume() } catch (_) { /* falta un gesto del usuario */ }
  }
  return c.state === 'running'
}

/** ¿El navegador nos está dejando sonar ahora mismo? */
export function audioListo() {
  return !!ctx && ctx.state === 'running'
}

// ─── Silencio ─────────────────────────────────────────────────────────────────
export function estaSilenciado() {
  try { return localStorage.getItem(CLAVE_SILENCIO) === '1' } catch { return false }
}

export function setSilenciado(valor) {
  try { localStorage.setItem(CLAVE_SILENCIO, valor ? '1' : '0') } catch (_) {}
}

// ─── Reproducción ─────────────────────────────────────────────────────────────
function programar(c, { seq, tipo, vol, paso, dur }) {
  const now = c.currentTime
  seq.forEach((freq, i) => {
    const osc = c.createOscillator(), gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = tipo; osc.frequency.value = freq
    const t = now + i * paso
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.start(t); osc.stop(t + dur + 0.01)
  })
}

/**
 * Suena un aviso. `nombre` es una clave de SONIDOS.
 * No revienta nunca: si el navegador no deja sonar, simplemente no suena.
 */
export async function sonar(nombre) {
  const s = SONIDOS[nombre]
  if (!s || estaSilenciado()) return false
  if (!(await despertarAudio())) return false
  programar(ctx, s)
  return true
}

/** Mensaje de chat: doble ráfaga, mucho más audible que un bip suelto. */
export async function sonarMensaje() {
  if (!(await sonar('mensaje'))) return false
  setTimeout(() => { if (audioListo() && !estaSilenciado()) programar(ctx, SONIDOS.mensaje) }, 550)
  return true
}

// ─── Alarma del pedido nuevo ──────────────────────────────────────────────────
// Repite hasta que la caja lo atienda, con tope: sin tope, si nadie cierra el
// aviso timbra indefinidamente y la caja termina oyendo un timbre sin nada que
// atender (el pedido ya se atendió desde otra pantalla).
const ALARMA_MAX_MS = 45000

export function crearAlarma() {
  let intervalId = null
  let topeId = null
  const patron = () => sonar('nuevoPedido')
  const parar = () => {
    clearInterval(intervalId); intervalId = null
    clearTimeout(topeId); topeId = null
  }
  return {
    play() {
      parar()
      patron()
      intervalId = setInterval(patron, 2000)
      topeId = setTimeout(parar, ALARMA_MAX_MS)
    },
    stop: parar,
    test: patron,
  }
}

// El primer toque desbloquea el audio para toda la sesión, y al volver a la
// pestaña se vuelve a despertar (la pantalla bloqueada lo suspende).
if (typeof window !== 'undefined') {
  const desbloquear = () => { despertarAudio() }
  ;['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, desbloquear, { passive: true }))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) despertarAudio()
  })
}

// ─── Qué sonido va con cada cambio de estado ──────────────────────────────────
// "Los que importan": los que obligan a hacer algo o el otro está esperando.
// Los estados intermedios que no exigen nada no suenan, para que el sonido no
// se vuelva ruido de fondo y la gente deje de prestarle atención.

/** Panel del CLIENTE: qué le suena cuando su pedido cambia de estado. */
export const SONIDO_CLIENTE = {
  quoted:         'cotizado',
  accepted:       'aceptado',
  preparing:      'aceptado',
  in_transit:     'enCamino',
  arrived:        'llego',
  delivered_paid: 'entregado',
  delivered_cash: 'entregado',
  completed:      'entregado',
  cancelled:      'cancelado',
  rejected:       'cancelado',
}

/** Panel de la CAJA: qué le suena cuando un pedido cambia de estado. */
export const SONIDO_CAJA = {
  accepted:       'aceptado',    // el domiciliario aceptó la asignación
  delivered_paid: 'entregado',
  delivered_cash: 'entregado',
  pending_cuadre: 'entregado',
  cancelled:      'cancelado',   // el cliente canceló
  rejected:       'cancelado',   // el domiciliario rechazó
}

/** Panel del DOMICILIARIO. */
export const SONIDO_DOMICILIARIO = {
  assigned:  'asignado',
  cancelled: 'cancelado',
}

/**
 * Traduce un cambio de estado al sonido que le toca a ese panel.
 * Devuelve null si ese panel no debe sonar por ese cambio.
 */
export function sonidoDeEstado(panel, estado) {
  const mapa = panel === 'cliente' ? SONIDO_CLIENTE
    : panel === 'caja' ? SONIDO_CAJA
    : panel === 'domiciliario' ? SONIDO_DOMICILIARIO
    : null
  return (mapa && mapa[estado]) || null
}
