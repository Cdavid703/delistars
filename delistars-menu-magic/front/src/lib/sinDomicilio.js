// Días sin domicilios (pedido de David, 26 oct 2026): los lunes el domiciliario
// tiene pico y placa, así que ese día solo se puede recoger en la sede. El
// cliente lo ve en el menú y en el formulario, antes de intentar pedir.
//
// ESTE ARCHIVO SE COPIA IGUAL en delistars-menu-magic/front/src/lib. Una prueba
// (tests/sinDomicilio.test.mjs) avisa si difieren.

import { enColombia } from './horarios.js'

/** Día (como en horarios.js) → por qué no hay domicilios. */
export const DIAS_SIN_DOMICILIO = {
  lun: 'nuestro domiciliario tiene pico y placa',
}

const NOMBRE = { dom: 'domingo', lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado' }

/** null si hoy (hora de Colombia) hay domicilios; si no, { dia, motivo, texto }. */
export function sinDomicilioHoy(ahora = Date.now()) {
  const { dia } = enColombia(ahora)
  const motivo = DIAS_SIN_DOMICILIO[dia]
  if (!motivo) return null
  return {
    dia,
    motivo,
    texto: `Hoy ${NOMBRE[dia]} no hay domicilios: ${motivo}. Puedes pedir y recoger en la sede.`,
  }
}
