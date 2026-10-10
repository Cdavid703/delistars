// Calendario de Mercadeo: lo que se hizo y lo que se hará.
// Actividades en Firestore: mercadeo/calendario/actividades/{id}.
// Fechas como texto 'yyyy-mm-dd' en hora local (Colombia): un día es un día,
// sin líos de zona horaria.
import type { Timestamp } from 'firebase/firestore'

export const TIPOS = [
  { id: 'correo',     nombre: 'Campaña de correo',      color: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 'redes',      nombre: 'Publicación en redes',   color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300' },
  { id: 'promocion',  nombre: 'Promoción o descuento',  color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'evento',     nombre: 'Evento',                 color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'volanteo',   nombre: 'Volanteo',               color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { id: 'alianza',    nombre: 'Alianza o influencer',   color: 'bg-violet-100 text-violet-800 border-violet-300' },
  { id: 'otro',       nombre: 'Otro',                   color: 'bg-gray-100 text-gray-700 border-gray-300' },
] as const
export type TipoId = typeof TIPOS[number]['id']

export const ESTADOS = [
  { id: 'planeada',  nombre: 'Planeada' },
  { id: 'en_curso',  nombre: 'En curso' },
  { id: 'hecha',     nombre: 'Hecha' },
  { id: 'cancelada', nombre: 'Cancelada' },
] as const
export type EstadoId = typeof ESTADOS[number]['id']

export const SEDES_ACT = [
  { id: 'ambas',          nombre: 'Ambas sedes' },
  { id: 'santa_lucia',    nombre: 'Santa Lucía' },
  { id: 'santa_teresita', nombre: 'Santa Teresita' },
] as const

export interface Actividad {
  id: string
  titulo: string
  tipo: TipoId
  inicio: string          // 'yyyy-mm-dd'
  fin: string             // 'yyyy-mm-dd' (= inicio si es de un día)
  sede: string
  estado: EstadoId
  responsable?: string
  costo?: number | null
  notas?: string
  enlaces?: string        // uno por línea
  creadoPor?: string
  creadoAt?: Timestamp
  actualizadoAt?: Timestamp
}

export const tipoDe = (id: string) => TIPOS.find((t) => t.id === id) ?? TIPOS[TIPOS.length - 1]

// ─── Fechas ─────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
export const fechaTexto = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const deTexto = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d) }
export const sumarDias = (s: string, n: number) => { const d = deTexto(s); d.setDate(d.getDate() + n); return fechaTexto(d) }
export const diasEntre = (a: string, b: string) => Math.round((deTexto(b).getTime() - deTexto(a).getTime()) / 864e5)

/** Las 6 semanas (lunes a domingo) que muestran el mes de `anio`/`mes` (0-11). */
export function semanasDelMes(anio: number, mes: number): string[][] {
  const primero = new Date(anio, mes, 1)
  const inicio = new Date(primero)
  inicio.setDate(1 - ((primero.getDay() + 6) % 7))
  return Array.from({ length: 6 }, (_, s) =>
    Array.from({ length: 7 }, (_, d) => fechaTexto(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + s * 7 + d))))
}

/** Actividades que ocupan el día `dia`. */
export const actividadesDelDia = (acts: Actividad[], dia: string) =>
  acts.filter((a) => a.inicio <= dia && dia <= (a.fin || a.inicio))

/** Ya pasó y nadie la marcó como hecha ni cancelada: hay que revisarla. */
export const pendienteDeCerrar = (a: Actividad, hoy: string) =>
  (a.fin || a.inicio) < hoy && (a.estado === 'planeada' || a.estado === 'en_curso')

// ─── Fechas comerciales de Colombia ─────────────────────────────────────────
// n-ésimo `diaSemana` (0 = domingo) de un mes; n = -1 → el último.
function enesimo(anio: number, mes: number, diaSemana: number, n: number): string {
  if (n === -1) {
    const d = new Date(anio, mes + 1, 0)
    while (d.getDay() !== diaSemana) d.setDate(d.getDate() - 1)
    return fechaTexto(d)
  }
  const d = new Date(anio, mes, 1)
  while (d.getDay() !== diaSemana) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + 7 * (n - 1))
  return fechaTexto(d)
}

/** Fechas que suelen mover ventas en Colombia (sugerencias, no actividades). */
export function fechasComerciales(anio: number): { fecha: string; nombre: string }[] {
  const f: { fecha: string; nombre: string }[] = [
    { fecha: `${anio}-02-14`, nombre: 'San Valentín' },
    { fecha: enesimo(anio, 3, 6, -1), nombre: 'Día del Niño' },
    { fecha: enesimo(anio, 4, 0, 2), nombre: 'Día de la Madre' },
    { fecha: enesimo(anio, 5, 0, 3), nombre: 'Día del Padre' },
    { fecha: `${anio}-06-30`, nombre: 'Pago de prima' },
    { fecha: enesimo(anio, 8, 6, 3), nombre: 'Amor y Amistad' },
    { fecha: `${anio}-10-31`, nombre: 'Halloween' },
    { fecha: `${anio}-12-07`, nombre: 'Día de las Velitas' },
    { fecha: `${anio}-12-20`, nombre: 'Pago de prima' },
    { fecha: `${anio}-12-24`, nombre: 'Nochebuena' },
    { fecha: `${anio}-12-31`, nombre: 'Fin de año' },
  ]
  // Quincenas: días de pago (15 y último día del mes).
  for (let m = 0; m < 12; m++) {
    f.push({ fecha: `${anio}-${pad(m + 1)}-15`, nombre: 'Quincena' })
    f.push({ fecha: fechaTexto(new Date(anio, m + 1, 0)), nombre: 'Quincena' })
  }
  return f
}

// ─── Resultado de una actividad ─────────────────────────────────────────────
export interface PedidoResumen { createdAtMs: number; status: string; sedeId?: string; totalPrice?: number }
export const ENTREGADOS = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']

/**
 * Periodo con el que se compara: el mismo número de días justo antes, movido
 * en semanas completas (un martes se compara con el martes anterior).
 */
export function periodoComparacion(inicio: string, fin: string): { inicio: string; fin: string } {
  const dias = diasEntre(inicio, fin) + 1
  const salto = Math.ceil(dias / 7) * 7
  return { inicio: sumarDias(inicio, -salto), fin: sumarDias(fin, -salto) }
}

/** Pedidos entregados y ventas entre dos fechas (incluidas), de una sede o de ambas. */
export function resumenPeriodo(pedidos: PedidoResumen[], inicio: string, fin: string, sede: string) {
  const desde = deTexto(inicio).getTime()
  const hasta = deTexto(sumarDias(fin, 1)).getTime()
  let n = 0, ventas = 0
  for (const p of pedidos) {
    if (!ENTREGADOS.includes(p.status) || p.createdAtMs < desde || p.createdAtMs >= hasta) continue
    if (sede !== 'ambas' && p.sedeId !== sede) continue
    n++
    ventas += Number(p.totalPrice) || 0
  }
  return { pedidos: n, ventas }
}

/** Cambio porcentual (null si no hay base para comparar). */
export const variacion = (ahora: number, antes: number): number | null =>
  antes > 0 ? Math.round(((ahora - antes) / antes) * 100) : null
