// Etapas del pedido (especificación §8.1, decisión P-11 del 18 oct 2026).
//
// ESTE ARCHIVO ES LA FUENTE. Se copia idéntico a:
//   - delistars-menu-magic/back/src/shared/etapas.js  (servidor, Fase 3)
//   - la app móvil (Projects/Delistarsapp/src/lib/etapas.js)
// Una prueba (tests/etapas.test.mjs) avisa si las copias de este repo difieren.
//
// Modelo nuevo en cada pedido (orders/{id}):
//   etapa:            una de ETAPAS[tipo] (nunca retrocede)
//   excepcion:        null o una de EXCEPCIONES (no avanza la barra; sale un aviso)
//   excepcionMotivo:  texto o null
//   origen:           'web' | 'app' | 'caja'
//   version:          entero, sube con cada cambio de etapa/excepción
//   historial:        subcolección orders/{id}/historial (auditoría)
// El campo viejo `status` se conserva mientras las pantallas viejas lo usen. Un
// pedido sin `etapa` (los de antes) se traduce con DESDE_ESTADO_VIEJO.

export const ETAPAS = {
  domicilio: [
    { id: 'enviado',        texto: 'Enviado' },
    { id: 'confirmado',     texto: 'Confirmado' },
    { id: 'en_preparacion', texto: 'En preparación' },
    { id: 'listo',          texto: 'Listo' },
    { id: 'en_camino',      texto: 'En camino' },
    { id: 'llego',          texto: 'Llegó' },
    { id: 'entregado',      texto: 'Entregado' },
  ],
  recoger: [
    { id: 'enviado',        texto: 'Enviado' },
    { id: 'confirmado',     texto: 'Confirmado' },
    { id: 'en_preparacion', texto: 'En preparación' },
    { id: 'listo',          texto: 'Listo para recoger' },
    { id: 'entregado',      texto: 'Entregado' },
  ],
}

/** final: el pedido termina ahí. Las demás son temporales y se resuelven. */
export const EXCEPCIONES = {
  rechazado:              { texto: 'Rechazado',                          final: true },
  cancelado:              { texto: 'Cancelado',                          final: true },
  cancelacion_solicitada: { texto: 'Cancelación solicitada',             final: false },
  cambio_pendiente:       { texto: 'Cambio pendiente de tu aprobación',  final: false },
  no_entregado:           { texto: 'No se pudo entregar',                final: false },
  devuelto:               { texto: 'Devuelto a la sede',                 final: true },
}

export const ORIGENES = ['web', 'app', 'caja']

/** Estado viejo (`status`) → etapa nueva. Las excepciones viejas van aparte. */
export const DESDE_ESTADO_VIEJO = {
  pending:        'enviado',
  quoted:         'confirmado',
  assigned:       'confirmado',
  accepted:       'confirmado',
  preparing:      'en_preparacion',
  in_transit:     'en_camino',
  arrived:        'llego',
  delivered_paid: 'entregado',
  delivered_cash: 'entregado',
  pending_cuadre: 'entregado',
  completed:      'entregado',
}
export const EXCEPCION_DESDE_ESTADO_VIEJO = { rejected: 'rechazado', cancelled: 'cancelado' }

export const tipoDe = (order) => (order?.deliveryMode === 'pickup' ? 'recoger' : 'domicilio')

const indice = (tipo, etapa) => ETAPAS[tipo].findIndex((e) => e.id === etapa)

/** Etapa que tuvo un pedido viejo rechazado/cancelado, por las marcas de tiempo que dejó. */
function etapaPorMarcas(order, tipo) {
  if (order.inTransitAt && tipo === 'domicilio') return 'en_camino'
  if (order.preparingAt) return 'en_preparacion'
  if (order.quotedPrice != null || order.acceptedAt || order.quotedAt) return 'confirmado'
  return 'enviado'
}

/**
 * Etapa y excepción de cualquier pedido, nuevo o viejo:
 *   { tipo, etapa, excepcion, motivo }
 */
export function etapaDe(order) {
  const tipo = tipoDe(order)
  if (order?.etapa && indice(tipo, order.etapa) >= 0) {
    return { tipo, etapa: order.etapa, excepcion: order.excepcion ?? null, motivo: order.excepcionMotivo ?? null }
  }
  const status = order?.status
  const excepcion = EXCEPCION_DESDE_ESTADO_VIEJO[status] ?? null
  let etapa = excepcion ? etapaPorMarcas(order, tipo) : (DESDE_ESTADO_VIEJO[status] ?? 'enviado')
  // Un pedido de recoger nunca está "en camino" ni "llegó".
  if (indice(tipo, etapa) < 0) etapa = 'listo'
  const motivo = excepcion === 'rechazado' ? (order.rejectionReason ?? order.motivoRechazo ?? null)
    : excepcion === 'cancelado' ? (order.cancelReason ?? order.motivoCancelacion ?? null) : null
  return { tipo, etapa, excepcion, motivo }
}

/** La etapa nunca retrocede: devuelve la más avanzada de las dos. */
export function masAvanzada(tipo, a, b) {
  return indice(tipo, b) > indice(tipo, a) ? b : a
}

/**
 * Para la barra de progreso:
 *   { tipo, pasos: [{ id, texto, estado: 'hecha'|'actual'|'pendiente' }], excepcion: { id, texto, final, motivo } | null }
 */
export function progreso(order) {
  const { tipo, etapa, excepcion, motivo } = etapaDe(order)
  const actual = indice(tipo, etapa)
  return {
    tipo,
    pasos: ETAPAS[tipo].map((e, i) => ({
      ...e,
      estado: i < actual || (i === actual && etapa === 'entregado') ? 'hecha' : i === actual ? 'actual' : 'pendiente',
    })),
    excepcion: excepcion ? { id: excepcion, ...EXCEPCIONES[excepcion], motivo } : null,
  }
}

/** ¿Terminó? (entregado o con una excepción final) */
export function terminado(order) {
  const { etapa, excepcion } = etapaDe(order)
  return etapa === 'entregado' || !!(excepcion && EXCEPCIONES[excepcion]?.final)
}

/**
 * Transiciones permitidas (§8.1, §9). La Fase 3 las hace cumplir en el servidor;
 * hasta entonces documentan quién hace qué. `a` es una etapa o 'excepcion:<id>'.
 * `desde` vacío = cualquier etapa no terminada.
 */
export const TRANSICIONES = [
  { a: 'confirmado',     desde: ['enviado'],         roles: ['caja'] },
  { a: 'en_preparacion', desde: ['confirmado'],      roles: ['caja'], bloquea: ['cambio_pendiente', 'cancelacion_solicitada'] },
  { a: 'listo',          desde: ['en_preparacion'],  roles: ['caja'] },
  // Operación actual (hasta la Fase 5, asignación automática): el domiciliario
  // puede marcar preparación y salir sin que la caja haya marcado Listo.
  { a: 'en_preparacion', desde: ['confirmado'],      roles: ['domiciliario'], tipos: ['domicilio'], bloquea: ['cambio_pendiente', 'cancelacion_solicitada'] },
  { a: 'en_camino',      desde: ['confirmado', 'en_preparacion', 'listo'], roles: ['domiciliario'], tipos: ['domicilio'] },
  { a: 'llego',          desde: ['en_camino'],       roles: ['domiciliario'], tipos: ['domicilio'] },
  { a: 'entregado',      desde: ['llego'],           roles: ['domiciliario'], tipos: ['domicilio'] },
  // Operación actual: la caja entrega en sede aunque no haya marcado Listo.
  { a: 'entregado',      desde: ['confirmado', 'en_preparacion', 'listo'], roles: ['caja'], tipos: ['recoger'] },
  { a: 'excepcion:rechazado',              desde: ['enviado'],                                   roles: ['caja'], motivo: true },
  { a: 'excepcion:cancelado',              desde: ['enviado'],                                   roles: ['cliente'] },
  // La caja cancela con motivo hasta Listo (también para aprobar la solicitud
  // del cliente). En reparto (en camino o llegó) decide administración (§9.1).
  { a: 'excepcion:cancelado',              desde: ['enviado', 'confirmado', 'en_preparacion', 'listo'], roles: ['caja'], motivo: true },
  { a: 'excepcion:cancelado',              desde: [],                                            roles: ['admin'], motivo: true },
  { a: 'excepcion:cancelacion_solicitada', desde: ['confirmado', 'en_preparacion', 'listo', 'en_camino', 'llego'], roles: ['cliente'], motivo: true },
  // La caja propone un cambio (productos o total) antes de preparar; el cliente
  // lo acepta o lo rechaza (§9.2). Mientras tanto no se puede preparar.
  { a: 'excepcion:cambio_pendiente',       desde: ['enviado', 'confirmado'],                     roles: ['caja'], motivo: true },
  { a: 'excepcion:no_entregado',           desde: ['llego'],                                     roles: ['domiciliario'], motivo: true },
  { a: 'excepcion:devuelto',               desde: ['llego'],                                     roles: ['caja'] },
  // Quitar una excepción temporal sin mover la etapa: la caja niega la
  // solicitud de cancelación o resuelve el cambio pendiente (Fase 4, 20 oct 2026).
  { a: 'seguir',                           desde: [],                                            roles: ['caja'], solo: ['cancelacion_solicitada', 'cambio_pendiente'] },
]
