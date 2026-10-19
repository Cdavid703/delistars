// A dónde transfiere el cliente (Transferencia, Nequi o la parte digital del
// Mixto). FUENTE ÚNICA: la usa la web (ClientPanel → DatosTransferencia) y el
// servidor la entrega a la app (GET /api/v1/pedidos/datos-transferencia), con
// una copia idéntica en delistars-menu-magic/back/src/shared/.
//
// Hoy las dos sedes reciben en la misma cuenta. Si una sede cambia de cuenta,
// se agrega aquí su propia entrada en POR_SEDE.

const CUENTA_DELISTARS = {
  banco: 'Bancolombia',
  tipo: 'Ahorros',
  numero: '42067993891',
  numeroVisible: '420 679 938 91',
  titular: 'DELISTARS',
  // Ruta del QR dentro de la app de domicilios (public/). El QR de Bancolombia
  // también se puede pagar desde Nequi.
  qr: 'qr-bancolombia.jpeg',
}

const POR_SEDE = {
  santa_lucia: CUENTA_DELISTARS,
  santa_teresita: CUENTA_DELISTARS,
}

/** Datos para transferir de una sede (las dos usan hoy la misma cuenta). */
export const datosTransferencia = (sedeId) => POR_SEDE[sedeId] ?? CUENTA_DELISTARS

export const INSTRUCCION_TRANSFERENCIA = 'Escanea el QR o transfiere a la cuenta'
