import { Router, Request, Response, NextFunction } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { pedidosApiActiva } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import { conIdempotencia, conIdempotenciaOpcional } from '../services/idempotencia.service';
import { crearPedidoCaja } from '../services/pedidoCaja.service';
import { crearPedido, transicionar, registrarPago, accionCaja, proponerCambio, responderCambio, agregarProducto, enviarMensaje, editorPedido } from '../services/pedidos.service';
import { generarCodigoPedido, verConCodigo, vincularConCodigo } from '../services/codigo.service';
import { verComoDestinatario } from '../services/destinatario.service';
import { darInstruccion, entenderInstruccion, fijarIndicaciones, devolverPlata } from '../services/incidencias.service';
import { datosTransferencia, INSTRUCCION_TRANSFERENCIA } from '../../../shared/datosTransferencia';
import { SEDES } from '../reglas/sedes';

/**
 * Pedidos (Fase 3). Todas las rutas piden token de Firebase y `Idempotency-Key`.
 * Respuestas de error: { error: texto para mostrar, codigo: identificador }.
 */
const router = Router();

const activa = (_req: Request, res: Response, next: NextFunction) =>
  pedidosApiActiva() ? next() : res.status(503).json({ error: 'La API de pedidos aún no está activa aquí', codigo: 'inactiva' });

function responderError(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[pedidos] error:', err);
  return res.status(500).json({ error: 'No se pudo procesar el pedido. Intenta de nuevo', codigo: 'interno' });
}

/**
 * @swagger
 * /api/v1/pedidos/datos-transferencia:
 *   get:
 *     tags: [Pedidos]
 *     summary: A dónde transferir (Transferencia, Nequi o parte digital del Mixto)
 *     description: Público (la web los muestra a quien paga). `?sedeId=` opcional.
 *     responses:
 *       200: { description: "{ sedeId, banco, tipo, numero, numeroVisible, titular, qrUrl, instruccion }" }
 */
router.get('/datos-transferencia', (req: Request, res: Response) => {
  const sedeId = typeof req.query.sedeId === 'string' ? req.query.sedeId : '';
  if (sedeId && !SEDES[sedeId]) return res.status(400).json({ error: 'Sede no válida', codigo: 'sede' });
  const c = datosTransferencia(sedeId);
  // Detrás del gateway el protocolo llega como http: fuera de local siempre es https.
  const host = req.get('host') || 'delistars.com';
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
  res.set('Cache-Control', 'public, max-age=300').json({
    sedeId: sedeId || null,
    banco: c.banco, tipo: c.tipo, numero: c.numero, numeroVisible: c.numeroVisible, titular: c.titular,
    qrUrl: `${proto}://${host}/domicilios/${c.qr}`,
    instruccion: INSTRUCCION_TRANSFERENCIA,
  });
});

/**
 * @swagger
 * /api/v1/pedidos/codigo/ver:
 *   post:
 *     tags: [Pedidos]
 *     summary: Ver un pedido de caja con su código privado (sin cuenta)
 *     description: >
 *       Público (sin token). 5 códigos equivocados seguidos desde la misma conexión la
 *       bloquean 15 min (429 `bloqueado`). Código vencido (pedido terminado hace más de 30 días) → 410.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "codigo": "K7QM-4ZP9" }
 *     responses:
 *       200: { description: "{ id, orderNumber, sedeName, deliveryMode, etapa, excepcion, items, total, pago, domiciliario, vinculado, ... }" }
 */
router.post('/codigo/ver', activa, async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store').json(await verConCodigo(req.body?.codigo, req.ip ?? ''));
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/destinatario/ver:
 *   post:
 *     tags: [Pedidos]
 *     summary: Lo que ve quien recibe un pedido para otra persona (sin cuenta)
 *     description: >
 *       Público (sin token de Firebase). `token` = el de `destinatario.token` del pedido
 *       (enlace /domicilios/?recibe=<token>). Estado, mapa mientras va en camino y lo que
 *       tiene que pagar (o `noPaga: true`); sin chats, datos de cuenta ni desglose.
 *       Vence 3 h después de que el pedido termina (410 `vencido`).
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "token": "Xk3...24 caracteres" }
 *     responses:
 *       200: { description: "{ id, orderNumber, sedeName, etapa, excepcion, recibe, envia, direccion, domiciliario, ubicacion, destino, noPaga, aPagar, billete, cambio, venceAt }" }
 */
router.post('/destinatario/ver', activa, async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store').json(await verComoDestinatario(req.body?.token));
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/codigo/vincular:
 *   post:
 *     tags: [Pedidos]
 *     summary: Guardar un pedido de caja en la cuenta de quien tiene el código
 *     description: Requiere cuenta (no anónima). Después el pedido sale en "Mis pedidos".
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "codigo": "K7QM-4ZP9" }
 *     responses:
 *       200: { description: "{ id, vinculado: true }" }
 */
router.post('/codigo/vincular', activa, requireUser, async (req: Request, res: Response) => {
  try {
    res.json(await vincularConCodigo(req.usuario!, req.body?.codigo, req.ip ?? ''));
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/codigo:
 *   post:
 *     tags: [Pedidos]
 *     summary: Generar el código privado de un pedido de caja (caja o admin)
 *     description: Uno nuevo anula el anterior. Solo pedidos sin cuenta y vigentes.
 *     responses:
 *       200: { description: "{ id, codigo, reemplazo }" }
 */
router.post('/:id/codigo', activa, requireUser, async (req: Request, res: Response) => {
  try {
    res.json(await generarCodigoPedido(req.usuario!, req.params.id));
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos:
 *   post:
 *     tags: [Pedidos]
 *     summary: Crear un pedido (cliente con cuenta)
 *     description: >
 *       Precios del catálogo del servidor; domicilio por recorrido si llega `coords`.
 *       Opcionales: `revisarDomicilio: true` (la caja cotiza el domicilio a mano),
 *       `pinFuente` (mapa | google | photon | app), `codigo`, `premios` (cantidad), `usarSaldo`,
 *       `origen` ('web' | 'app'; por defecto 'app'),
 *       `destinatario` ({ nombre, telefono, paga: 'comprador' | 'destinatario' }: lo recibe otra persona, solo domicilio).
 *       Encabezados: Authorization: Bearer <idToken>, Idempotency-Key: <uuid>.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "sedeId": "santa_lucia", "deliveryMode": "delivery", "nombre": "Ana", "telefono": "3001234567",
 *             "direccion": "Cra 80 #45-10 apto 201", "barrio": "La América", "referencia": "Portería",
 *             "coords": { "lat": 6.25, "lng": -75.6 }, "notas": "",
 *             "items": [{ "id_producto": 4, "cantidad": 1, "adiciones": [{ "id_producto": 44, "cantidad": 1 }], "salsas": [74], "cebollas": [75] }] }
 *     responses:
 *       201: { description: "{ id, orderNumber, etapa, version, subtotal, deliveryPrice, total, items }" }
 */
router.post('/', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), req.body, async () => ({
      status: 201, body: await crearPedido(req.usuario!, req.body, req.ip ?? ''),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/editor:
 *   post:
 *     tags: [Pedidos]
 *     summary: Tomar o soltar el control de un pedido (un solo editor, §10.3)
 *     description: >
 *       Caja de la sede o admin. { accion: 'tomar' | 'soltar', motivo? }. Tomar uno libre no pide motivo; tomar el
 *       de otro («Tomar control») exige motivo (422 motivo), queda en el historial y se le avisa al anterior.
 *       Mientras otro lo tenga, las acciones de caja responden 409 otro_editor.
 *     responses:
 *       200: { description: "{ id, editor: { uid, email, nombre } | null, cambio }" }
 */
router.post('/:id/editor', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await editorPedido(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/caja:
 *   post:
 *     tags: [Pedidos]
 *     summary: La caja crea un pedido desde el catálogo (presencial, teléfono o WhatsApp)
 *     description: >
 *       Caja de la sede o admin. { sedeId, deliveryMode, nombre, telefono, canal?: presencial | telefono | whatsapp,
 *       direccion?, coords?, barrio?, referencia?, deliveryPrice? (si no hay coords o para fijarlo a mano), notas?,
 *       items (mismo formato que POST /pedidos), pago: { metodo, billete?, mixtoEfectivo?, mixtoTransferencia? } }.
 *       Precios del catálogo y agotados de la sede (409 agotado_en_sede). Nace confirmado; a domicilio se asigna
 *       al domiciliario en turno o queda por asignar. Sin cuenta: devuelve el código privado. Exige Idempotency-Key.
 *     responses:
 *       200: { description: "{ id, orderNumber, etapa, subtotal, deliveryPrice, total, items, domiciliario, codigo }" }
 */
router.post('/caja', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), { caja: true, ...req.body }, async () => ({
      status: 200, body: await crearPedidoCaja(req.usuario!, req.body, req.ip || ''),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/transiciones:
 *   post:
 *     tags: [Pedidos]
 *     summary: Mover de etapa o poner una excepción
 *     description: >
 *       `a`: confirmado | en_preparacion | listo | en_camino | llego | entregado |
 *       excepcion:rechazado | excepcion:cancelado | excepcion:cancelacion_solicitada |
 *       excepcion:cambio_pendiente | excepcion:no_entregado | excepcion:devuelto.
 *       `version` (opcional, recomendado): la que el cliente vio; si cambió → 409.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "a": "excepcion:cancelado", "motivo": "Me equivoqué de dirección", "version": 1 }
 *     responses:
 *       200: { description: "{ id, etapa, excepcion, version }" }
 */
router.post('/:id/transiciones', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, ...req.body };
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await transicionar(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/pago:
 *   post:
 *     tags: [Pedidos]
 *     summary: Elegir o corregir el pago (adelantado o tras la cotización)
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "metodo": "Efectivo", "billete": 50000 }
 *     responses:
 *       200: { description: "{ id, metodo, total, adelantado, cambio, faltaComprobante }" }
 */
router.post('/:id/pago', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, pago: true, ...req.body };
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await registrarPago(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/cambio:
 *   post:
 *     tags: [Pedidos]
 *     summary: La caja propone un cambio al cliente (antes de preparar)
 *     description: >
 *       { items, quotedPrice, deliveryPrice?, motivo, version?, direccion? }. `direccion` (W-5, solo domicilio):
 *       { texto, coords: { lat, lng }, barrio?, referencia? }; el servidor mide el recorrido desde la sede del pedido
 *       y pone la tarifa (409 fuera_de_cobertura | sin_medicion); items y quotedPrice quedan como están si no se mandan.
 *       La propuesta guarda `direccion` y `anterior.direccion`. El pedido queda con la excepción
 *       `cambio_pendiente` y la propuesta en `cambioPropuesto`; el original no se toca hasta que el
 *       cliente acepte. Con pago adelantado o saldo aplicado el total no puede cambiar (409 `pagado` / `saldo`).
 *     responses:
 *       200: { description: "{ id, etapa, excepcion, version, totalPropuesto }" }
 */
router.post('/:id/cambio', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, cambio: true, ...req.body };
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await proponerCambio(req.usuario!, req.params.id, req.body, req.ip || ''),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/cambio/responder:
 *   post:
 *     tags: [Pedidos]
 *     summary: El cliente acepta o rechaza el cambio propuesto
 *     description: >
 *       { acepta: true | false, propuestaId?, version? }. Aceptar aplica lo propuesto; rechazar conserva el
 *       original. `propuestaId` (cambioPropuesto.id) y `version` (la del pedido que vio el cliente) son
 *       opcionales y recomendados (W-3): si la caja retiró esa propuesta o hizo otra → 409
 *       `propuesta_reemplazada` / `version`. Acepta `Idempotency-Key` opcional: el reintento devuelve la
 *       misma respuesta en vez de 409 `sin_propuesta`.
 *     responses:
 *       200: { description: "{ id, aceptado, etapa, version, propuestaId }" }
 */
router.post('/:id/cambio/responder', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, responderCambio: true, ...req.body };
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await responderCambio(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/agregar:
 *   post:
 *     tags: [Pedidos]
 *     summary: El cliente agrega algo a su pedido mientras está en Enviado
 *     description: "{ texto }. Suma la línea «+ texto», marca `needsRequote` y deja el mensaje en el chat."
 *     responses:
 *       200: { description: "{ id, agregado }" }
 */
router.post('/:id/agregar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await agregarProducto(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/mensajes:
 *   post:
 *     tags: [Pedidos]
 *     summary: "Mensaje en un chat del pedido (§8.3): canal caja o domiciliario"
 *     description: >
 *       { canal: 'caja' | 'domiciliario', texto } → { id, canal, mensaje }.
 *       caja: cliente ↔ caja (queda en clientMessages). domiciliario: cliente ↔ domiciliario asignado
 *       (subcolección chat_domiciliario; la caja no la lee). Abierto hasta 3 h después de la entrega.
 *       Errores: 422 canal | texto | largo, 409 rechazado | vencido | sin_domiciliario, 403 sin_permiso.
 *       `Idempotency-Key` opcional (W-4): con la misma clave, un reintento no repite el mensaje.
 *     responses:
 *       200: { description: "{ id, canal, mensaje: { role, name, text, ts } }" }
 */
router.post('/:id/mensajes', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, mensaje: true, ...req.body };
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await enviarMensaje(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/instruccion:
 *   post:
 *     tags: [Pedidos]
 *     summary: La caja le da una instrucción al domiciliario tras «No puedo entregar» (CP-2)
 *     description: >
 *       Caja de la sede o admin. Solo con la excepción `no_entregado`. `tipo`: esperar | reintentar | regresar.
 *       No mueve la etapa; sube la versión. La misma instrucción otra vez → `sinCambios: true`.
 *       `Idempotency-Key` opcional. El scheduler avisa al domiciliario (push con `tipo: 'instruccion'`).
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "tipo": "regresar" }
 *     responses:
 *       200: { description: "{ id, instruccionCaja: { tipo, texto, at, por, entendidoAt }, version, sinCambios }" }
 */
router.post('/:id/instruccion', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, instruccion: true, ...req.body };
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await darInstruccion(req.usuario!, req.params.id, req.body?.tipo),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/instruccion/entendido:
 *   post:
 *     tags: [Pedidos]
 *     summary: El domiciliario acusa la instrucción de la caja (CP-2)
 *     description: Solo marca `instruccionCaja.entendidoAt`; no mueve la etapa ni la versión. Repetirlo no hace nada.
 *     responses:
 *       200: { description: "{ id, tipo, entendido: true, sinCambios }" }
 */
router.post('/:id/instruccion/entendido', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), { id: req.params.id, entendido: true }, async () => ({
      status: 200, body: await entenderInstruccion(req.usuario!, req.params.id),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/indicaciones:
 *   post:
 *     tags: [Pedidos]
 *     summary: Indicaciones breves de la caja para el domiciliario (CP-4)
 *     description: Caja de la sede o admin. Máximo 90 caracteres (se leen manejando). `""` las borra.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "texto": "Portería norte, timbre 3" }
 *     responses:
 *       200: { description: "{ id, indicacionesBreves, sinCambios }" }
 */
router.post('/:id/indicaciones', activa, requireUser, async (req: Request, res: Response) => {
  try {
    res.json(await fijarIndicaciones(req.usuario!, req.params.id, req.body?.texto));
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/devolver-plata:
 *   post:
 *     tags: [Pedidos]
 *     summary: La caja le devuelve la plata a un pedido que volvió a la sede
 *     description: >
 *       Caja de la sede o admin, solo con la excepción `devuelto` y una vez. Lo pagado por transferencia
 *       queda en `devolucion` (por_elegir, como al cancelar) y el saldo a favor usado vuelve a la cuenta.
 *       Se le escribe al cliente en el chat. 409 `nada` si no pagó nada por adelantado.
 *     responses:
 *       200: { description: "{ id, devolucion, saldoDevuelto }" }
 */
router.post('/:id/devolver-plata', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), { id: req.params.id, devolverPlata: true }, async () => ({
      status: 200, body: await devolverPlata(req.usuario!, req.params.id),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/{accion}:
 *   post:
 *     tags: [Pedidos]
 *     summary: "Acciones de caja y domiciliario: cotizar | asignar | aceptar | cuadre"
 *     description: >
 *       cotizar (caja): { quotedPrice, deliveryPrice, cashierNotes?, orderNumber?, version? } → status quoted, etapa ≥ confirmado.
 *       asignar (caja): { driverEmail, driverName?, driverPhone?, driverNotes?, quotedPrice?, deliveryPrice?, totalPrice?,
 *       cashOnDelivery?, payExact?, payAmount?, change?, orderNumber? } → status assigned.
 *       aceptar (domiciliario asignado) → status accepted. cuadre (caja): pending_cuadre → completed.
 *     responses:
 *       200: { description: "{ id, etapa, version, status }" }
 */
for (const accion of ['cotizar', 'asignar', 'aceptar', 'cuadre'] as const) {
  router.post(`/:id/${accion}`, activa, requireUser, async (req: Request, res: Response) => {
    try {
      const cuerpo = { id: req.params.id, accion, ...req.body };
      const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
        status: 200, body: await accionCaja(req.usuario!, req.params.id, accion, req.body),
      }));
      res.status(r.status).json(r.body);
    } catch (err) { responderError(res, err); }
  });
}

export default router;
