// Mercadeo: audiencia (conteos que publica el scheduler en
// config/mercadeo_audiencia, sin datos personales) y campañas de correo
// (colección `campanas`). El envío se activa cuando se configure el proveedor.
import type { Timestamp } from 'firebase/firestore'

export interface Segmento { clientes: number; aceptan: number; notificables?: number }

export interface Audiencia {
  clientes: number
  conCorreo: number
  aceptan: number
  /** Aceptan promociones y tienen la app o el navegador con notificaciones. */
  notificables?: number
  segmentos: Record<string, Segmento>
  actualizado?: Timestamp
}

// Mismos ids que calcula el scheduler (delistars-menu-magic/scheduler/audiencia.js).
export const SEGMENTOS: { id: string; nombre: string; detalle: string }[] = [
  { id: 'todos',          nombre: 'Todos los clientes',       detalle: 'Todos los que tienen correo' },
  { id: 'santa_lucia',    nombre: 'Clientes de Santa Lucía',  detalle: 'Su sede habitual es Santa Lucía' },
  { id: 'santa_teresita', nombre: 'Clientes de Santa Teresita', detalle: 'Su sede habitual es Santa Teresita' },
  { id: 'inactivos30',    nombre: 'No piden hace 90 días',    detalle: 'Su último pedido fue hace más de 90 días' },
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
  /** Fecha prevista de envío ('yyyy-mm-dd'): la campaña aparece en el calendario. */
  fechaPrevista?: string
  estado: 'borrador' | 'enviada'
  /** Envío por correo: lo pide el panel y lo hace el scheduler (marketing@delistars.com). */
  envio?: {
    estado: 'prueba_solicitada' | 'prueba_enviada' | 'solicitado' | 'enviando' | 'enviada' | 'pausada' | 'error'
    pruebaA?: string
    total?: number
    enviados?: number
    fallidos?: number
    error?: string | null
    solicitadoPor?: string
    solicitadoAt?: Timestamp
    enviadaAt?: Timestamp
    /** Cuántas veces se ha pedido el envío (la campaña se puede reenviar). */
    ronda?: number
    historial?: { fecha: string; enviados: number; fallidos: number; por?: string; ronda?: number }[]
  }
  creadoPor?: string
  creadoAt?: Timestamp
  actualizadoAt?: Timestamp
  // ── Notificación y franja (§17, Fase 7) ──
  /** Canales: correo (el de siempre), notificación (app y navegador) y franja del menú. */
  canales?: { correo?: boolean; push?: boolean; franja?: boolean }
  /** Sede de la campaña ('' = las dos). Define el destino y la atribución. */
  sedeId?: string
  /** Vigencia (milisegundos): obligatoria para notificación y franja. */
  vigencia?: { inicio?: number | null; fin?: number | null }
  push?: { titulo?: string; texto?: string }
  franja?: { titulo?: string; texto?: string }
  destino?: { tipo: 'menu' | 'producto' | 'categoria' | 'premios'; id?: string | number | null }
  /** Mercadeo la programó (empieza sola en `vigencia.inicio`). */
  programada?: boolean
  pausada?: boolean
  /** Lo escribe el servidor: cola de notificaciones y métricas agregadas. */
  cola?: { encolada?: boolean; encoladaAt?: number; total?: number }
  metricas?: { enCola?: number; enviados?: number; expirados?: number; omitidos?: number; aperturas?: number; clics?: number; pedidos?: number; ventas?: number }
}

export const conCorreo = (c: Partial<Campana>) => c.canales?.correo !== false

/** Estado de la programación (notificación / franja) para mostrar. */
export function estadoProgramacion(c: Partial<Campana>, ahora = Date.now()): 'sin_programar' | 'programada' | 'activa' | 'pausada' | 'terminada' {
  if (!c.programada) return 'sin_programar'
  const ini = Number(c.vigencia?.inicio) || 0, fin = Number(c.vigencia?.fin) || 0
  if (fin && ahora >= fin) return 'terminada'
  if (c.pausada) return 'pausada'
  return ini && ahora < ini ? 'programada' : 'activa'
}

type ProductoConPromo = { id_producto: number; reglas?: { promo?: { hasta?: string } | null } | null }

/** Qué falta para programar la notificación o la franja (espejo de scheduler/promos.js). */
export function faltantesProgramar(c: Partial<Campana>, productos: ProductoConPromo[] = []): string[] {
  const f: string[] = []
  if (!c.canales?.push && !c.canales?.franja) f.push('elegir notificación o franja')
  const ini = Number(c.vigencia?.inicio) || 0, fin = Number(c.vigencia?.fin) || 0
  if (!ini || !fin) f.push('la fecha y hora de inicio y de fin')
  else if (fin <= ini) f.push('un fin después del inicio')
  if (c.canales?.push) {
    if (!c.push?.titulo?.trim()) f.push('el título de la notificación')
    if (!c.push?.texto?.trim()) f.push('el texto de la notificación')
  }
  if (c.canales?.franja && !c.franja?.texto?.trim()) f.push('el texto de la franja')
  const d = c.destino
  if (d && (d.tipo === 'producto' || d.tipo === 'categoria') && !d.id) f.push(d.tipo === 'producto' ? 'el producto del destino' : 'la categoría del destino')
  // La campaña no puede durar más que el beneficio (combo con fechas).
  if (d?.tipo === 'producto' && d.id && fin) {
    const hasta = productos.find((p) => String(p.id_producto) === String(d.id))?.reglas?.promo?.hasta
    if (hasta && fin > new Date(`${hasta}T00:00:00-05:00`).getTime() + 24 * 60 * 60 * 1000) f.push(`un fin que no pase del ${hasta}, cuando termina ese combo`)
  }
  return f
}

export const CAMPANA_VACIA: Omit<Campana, 'id'> = {
  nombre: '',
  asunto: '',
  segmento: 'todos',
  mensaje: '',
  imagenUrl: '',
  botonTexto: 'Pedir ahora',
  botonUrl: 'https://delistars.com/',
  fechaPrevista: '',
  estado: 'borrador',
  canales: { correo: true, push: false, franja: false },
  sedeId: '',
  vigencia: { inicio: null, fin: null },
  push: { titulo: '', texto: '' },
  franja: { titulo: '', texto: '' },
  destino: { tipo: 'menu', id: null },
}

/** Qué le falta a una campaña para poder guardarse. */
export function faltantes(c: Omit<Campana, 'id'>): string[] {
  const f: string[] = []
  if (!c.nombre.trim()) f.push('el nombre de la campaña')
  if (conCorreo(c) && !c.asunto.trim()) f.push('el asunto del correo')
  if (conCorreo(c) && !c.mensaje.trim()) f.push('el mensaje')
  if (!c.canales?.correo && !c.canales?.push && !c.canales?.franja && c.canales) f.push('al menos un canal')
  if (c.botonUrl && !/^https:\/\//.test(c.botonUrl)) f.push('un enlace del botón que empiece por https://')
  if (c.imagenUrl && !/^https:\/\//.test(c.imagenUrl)) f.push('un enlace de imagen que empiece por https://')
  return f
}
