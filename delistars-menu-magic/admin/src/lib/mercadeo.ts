// Mercadeo: audiencia (conteos que publica el scheduler en
// config/mercadeo_audiencia, sin datos personales) y campañas de correo
// (colección `campanas`). El envío se activa cuando se configure el proveedor.
import type { Timestamp } from 'firebase/firestore'

export interface Segmento { clientes: number; aceptan: number }

export interface Audiencia {
  clientes: number
  conCorreo: number
  aceptan: number
  segmentos: Record<string, Segmento>
  actualizado?: Timestamp
}

// Mismos ids que calcula el scheduler (delistars-menu-magic/scheduler/audiencia.js).
export const SEGMENTOS: { id: string; nombre: string; detalle: string }[] = [
  { id: 'todos',          nombre: 'Todos los clientes',       detalle: 'Todos los que tienen correo' },
  { id: 'santa_lucia',    nombre: 'Clientes de Santa Lucía',  detalle: 'Su sede habitual es Santa Lucía' },
  { id: 'santa_teresita', nombre: 'Clientes de Santa Teresita', detalle: 'Su sede habitual es Santa Teresita' },
  { id: 'inactivos30',    nombre: 'No piden hace 30 días',    detalle: 'Su último pedido fue hace más de 30 días' },
  { id: 'frecuentes',     nombre: 'Clientes frecuentes',      detalle: '5 pedidos o más' },
  { id: 'nuevos',         nombre: 'Clientes nuevos',          detalle: 'Han hecho un solo pedido' },
  { id: 'cercaPremio',    nombre: 'Les falta 1 sello',        detalle: 'El próximo pedido les da el premio de fidelización' },
]

export const nombreSegmento = (id: string) => SEGMENTOS.find((s) => s.id === id)?.nombre ?? id

export interface Campana {
  id: string
  nombre: string
  asunto: string
  segmento: string
  mensaje: string
  imagenUrl?: string
  botonTexto?: string
  botonUrl?: string
  estado: 'borrador' | 'enviada'
  creadoPor?: string
  creadoAt?: Timestamp
  actualizadoAt?: Timestamp
}

export const CAMPANA_VACIA: Omit<Campana, 'id'> = {
  nombre: '',
  asunto: '',
  segmento: 'todos',
  mensaje: '',
  imagenUrl: '',
  botonTexto: 'Pedir ahora',
  botonUrl: 'https://delistars.com/',
  estado: 'borrador',
}

/** Qué le falta a una campaña para poder guardarse. */
export function faltantes(c: Omit<Campana, 'id'>): string[] {
  const f: string[] = []
  if (!c.nombre.trim()) f.push('el nombre de la campaña')
  if (!c.asunto.trim()) f.push('el asunto del correo')
  if (!c.mensaje.trim()) f.push('el mensaje')
  if (c.botonUrl && !/^https:\/\//.test(c.botonUrl)) f.push('un enlace del botón que empiece por https://')
  if (c.imagenUrl && !/^https:\/\//.test(c.imagenUrl)) f.push('un enlace de imagen que empiece por https://')
  return f
}
