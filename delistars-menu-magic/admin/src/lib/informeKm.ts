// Informe semanal de kilómetros y domicilios, con la distancia por calle que
// cada pedido guarda desde 2026-10-09 (deliveryKm + deliveryKmMedida). No
// consulta a Google: sale de los pedidos.
//
// Los km son de IDA (sede → cliente). El domiciliario además regresa, así que
// lo que de verdad maneja es aproximadamente el doble.
import type { Order } from './orders'

// Entregados, incluido el que espera el cuadre del efectivo.
const ENTREGADOS = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']

export type PedidoKm = Order & {
  deliveryKm?: number
  deliveryKmMedida?: 'recorrido' | 'linea_recta'
  deliveryPriceAuto?: boolean
}

export interface FilaKm {
  clave: string
  entregas: number
  /** Entregas con distancia por calle (las únicas que suman km). */
  conKm: number
  km: number
  domicilio: number
}

/** Lunes 00:00 (hora local) de la semana de `fecha`. */
export function lunesDe(fecha: Date): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Las últimas `n` semanas (lunes), de la más reciente a la más vieja. */
export function ultimasSemanas(n: number, hoy = new Date()): Date[] {
  const l = lunesDe(hoy)
  return Array.from({ length: n }, (_, i) => new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7 * i))
}

export const etiquetaSemana = (lunes: Date): string => {
  const dom = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  return `${f(lunes)} al ${f(dom)}`
}

function agrupar(pedidos: PedidoKm[], claveDe: (o: PedidoKm) => string): FilaKm[] {
  const m = new Map<string, FilaKm>()
  for (const o of pedidos) {
    const clave = claveDe(o)
    const f = m.get(clave) ?? { clave, entregas: 0, conKm: 0, km: 0, domicilio: 0 }
    f.entregas++
    f.domicilio += Number(o.deliveryPrice) || 0
    if (o.deliveryKmMedida === 'recorrido' && Number.isFinite(o.deliveryKm)) {
      f.conKm++
      f.km += Number(o.deliveryKm)
    }
    m.set(clave, f)
  }
  return [...m.values()].sort((a, b) => b.km - a.km || b.entregas - a.entregas)
}

/**
 * Domicilios entregados en la semana que empieza el lunes `lunes`, agrupados
 * por domiciliario y por barrio. `sede` filtra por sedeName (vacío = todas).
 */
export function informeSemana(orders: PedidoKm[], lunes: Date, sede = '') {
  const desde = lunes.getTime()
  const hasta = desde + 7 * 24 * 60 * 60 * 1000
  const semana = orders.filter((o) => {
    if (o.deliveryMode !== 'delivery' || !ENTREGADOS.includes(o.status)) return false
    if (sede && o.sedeName !== sede) return false
    const t = o.createdAt?.toDate?.().getTime()
    return t !== undefined && t >= desde && t < hasta
  })
  const total = agrupar(semana, () => 'total')[0] ?? { clave: 'total', entregas: 0, conKm: 0, km: 0, domicilio: 0 }
  return {
    total,
    porDomiciliario: agrupar(semana, (o) => o.driverName || o.driverEmail || 'Sin domiciliario'),
    porBarrio: agrupar(semana, (o) => (o.barrio || '').trim() || 'Sin barrio'),
  }
}

/** Pesos de domicilio por km recorrido (de ida). null sin km. */
export const pesosPorKm = (f: FilaKm): number | null => {
  if (!f.conKm || f.km <= 0) return null
  // Solo el domicilio de las entregas que tienen km, para no inflar el valor.
  const domicilioConKm = f.entregas === f.conKm ? f.domicilio : (f.domicilio / f.entregas) * f.conKm
  return Math.round(domicilioConKm / f.km)
}
