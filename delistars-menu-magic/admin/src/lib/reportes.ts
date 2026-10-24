// Reportes aprobados (especificación §16.3): se calculan en el servidor
// (GET /api/v1/reportes) y aquí se piden, se arman en tablas y se exportan a
// Excel y PDF con los mismos filtros que se ven en pantalla.
import { auth } from '@/services/firebase'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

export const SEDES: Record<string, string> = { santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }
export const nombreSede = (id: string | null | undefined) => (id ? SEDES[id] || id : 'Las dos sedes')

type Est = { n: number; mediana: number | null; promedio: number | null; p90: number | null }
export interface Reporte {
  desde: string; hasta: string; sedeId: string | null; dias: number; generadoAt: number
  formulas: string[]; avisos: string[]
  financiero: {
    pedidos: { total: number; entregados: number; cancelados: number; rechazados: number; enCurso: number }
    ventas: { total: number; productos: number; domicilios: number; ticketPromedio: number }
    mediosPago: { medio: string; pedidos: number; monto: number }[]
    efectivo: number
    saldoAFavor: { pedidos: number; monto: number }
    premiosCanjeados: number
    cuadres: { entregasConfirmadas: number; montoRecibido: number; conDiferencia: number; diferenciaNeta: number; diferenciasSinResolver: number; fondosEntregados: number; porConfirmar: number }
    pendientes: { efectivoPorCuadrar: { pedidos: number; monto: number }; transferenciasSinVerificar: { pedidos: number; monto: number } }
  }
  tiempos: { aceptar: Est; preparacion: Est; recogida: Est; entrega: Est; total: Est }
  productos: { masVendidos: { nombre: string; unidades: number; ventas: number; pedidos: number }[]; menosVendidos: { nombre: string; unidades: number; ventas: number; pedidos: number }[]; totalUnidades: number; adiciones: { nombre: string; veces: number }[] }
  demanda: { porHora: { hora: number; pedidos: number; ventas: number }[]; porDiaSemana: { dia: number; pedidos: number; ventas: number }[]; porFecha: { fecha: string; pedidos: number; ventas: number }[] }
  clientes: { conPedido: number; nuevos: number; recurrentes: number; repitieronEnElPeriodo: number; pedidosPorCliente: number; premiosCanjeados: number }
  domicilios: { porDomiciliario: { email: string; nombre: string; entregas: number; fallidas: number; entregaMediana: number | null; entregasPorDia: number; domicilios: number; calificacion: number | null }[]; sinDomiciliario: number; recogidasEnSede: number }
  incidencias: {
    cancelaciones: { total: number; porMotivo: { motivo: string; n: number }[] }
    rechazos: { total: number; porMotivo: { motivo: string; n: number }[] }
    reclamos: { total: number; porCategoria: { categoria: string; n: number }[]; porMotivo: { motivo: string; n: number }[]; abiertos: number; resueltos: number; horasResolucionMediana: number | null; reembolsos: { n: number; monto: number }; productosInvolucrados: { nombre: string; n: number }[] }
  }
  porSede: { sedeId: string; pedidos: number; ventas: number }[]
}

export async function pedirReporte(desde: string, hasta: string, sedeId: string): Promise<Reporte> {
  const token = await auth.currentUser?.getIdToken()
  const qs = new URLSearchParams({ desde, hasta, ...(sedeId ? { sedeId } : {}) })
  const res = await fetch(`${API_BASE_URL}/reportes?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`)
  return datos as Reporte
}

// ── Fechas de Bogotá para los atajos de período
const hoyBogota = () => new Date(Date.now() - 5 * 3600 * 1000)
const iso = (d: Date) => d.toISOString().slice(0, 10)
export function periodo(cual: 'hoy' | 'ayer' | '7' | '30' | 'mes' | 'mesPasado'): { desde: string; hasta: string } {
  const h = hoyBogota()
  const dia = (n: number) => iso(new Date(h.getTime() - n * 86400000))
  if (cual === 'hoy') return { desde: iso(h), hasta: iso(h) }
  if (cual === 'ayer') return { desde: dia(1), hasta: dia(1) }
  if (cual === '7') return { desde: dia(6), hasta: iso(h) }
  if (cual === '30') return { desde: dia(29), hasta: iso(h) }
  const y = h.getUTCFullYear(), m = h.getUTCMonth()
  if (cual === 'mes') return { desde: iso(new Date(Date.UTC(y, m, 1))), hasta: iso(h) }
  return { desde: iso(new Date(Date.UTC(y, m - 1, 1))), hasta: iso(new Date(Date.UTC(y, m, 0))) }
}

export const pesos = (n: number | null | undefined) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`
const minutos = (n: number | null) => (n == null ? '—' : `${n} min`)
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const nombreDiaSemana = (d: number) => DIAS_SEMANA[d]

export type Celda = string | number
export interface Tabla { grupo: string; titulo: string; columnas: string[]; filas: Celda[][] }

/** Todo el reporte en tablas (pantalla, Excel y PDF usan las mismas). */
export function tablasDe(r: Reporte): Tabla[] {
  const f = r.financiero
  const t = r.tiempos
  const T: Tabla[] = [
    { grupo: 'Financiero y operación', titulo: 'Resumen', columnas: ['Concepto', 'Valor'], filas: [
      ['Pedidos recibidos', f.pedidos.total], ['Entregados (venta)', f.pedidos.entregados], ['Cancelados', f.pedidos.cancelados],
      ['Rechazados', f.pedidos.rechazados], ['En curso', f.pedidos.enCurso],
      ['Ventas', pesos(f.ventas.total)], ['   Productos', pesos(f.ventas.productos)], ['   Domicilios', pesos(f.ventas.domicilios)],
      ['Ticket promedio', pesos(f.ventas.ticketPromedio)], ['Cobrado en efectivo', pesos(f.efectivo)],
      ['Saldo a favor usado', `${pesos(f.saldoAFavor.monto)} (${f.saldoAFavor.pedidos} pedidos)`], ['Premios canjeados', f.premiosCanjeados],
    ] },
    { grupo: 'Financiero y operación', titulo: 'Medios de pago', columnas: ['Medio', 'Pedidos', 'Monto'], filas: f.mediosPago.map((m) => [m.medio, m.pedidos, pesos(m.monto)]) },
    { grupo: 'Financiero y operación', titulo: 'Cuadres de efectivo', columnas: ['Concepto', 'Valor'], filas: [
      ['Entregas confirmadas', f.cuadres.entregasConfirmadas], ['Efectivo recibido por la caja', pesos(f.cuadres.montoRecibido)],
      ['Entregas con diferencia', f.cuadres.conDiferencia], ['Diferencia neta (− faltó, + sobró)', pesos(f.cuadres.diferenciaNeta)],
      ['Diferencias sin resolver', f.cuadres.diferenciasSinResolver], ['Fondos para cambio entregados', pesos(f.cuadres.fondosEntregados)],
      ['Movimientos por confirmar', f.cuadres.porConfirmar],
    ] },
    { grupo: 'Financiero y operación', titulo: 'Cobros pendientes', columnas: ['Concepto', 'Pedidos', 'Monto'], filas: [
      ['Efectivo entregado sin cuadrar', f.pendientes.efectivoPorCuadrar.pedidos, pesos(f.pendientes.efectivoPorCuadrar.monto)],
      ['Transferencias sin verificar', f.pendientes.transferenciasSinVerificar.pedidos, pesos(f.pendientes.transferenciasSinVerificar.monto)],
    ] },
    { grupo: 'Tiempos', titulo: 'Tiempos (minutos)', columnas: ['Etapa', 'Pedidos', 'Mediana', 'Promedio', '9 de cada 10 en'], filas: ([
      ['Aceptar (pedido → confirmado)', t.aceptar], ['Preparación (→ listo)', t.preparacion], ['Recogida (listo → sale)', t.recogida],
      ['Entrega (sale → entregado)', t.entrega], ['Total (pedido → entregado)', t.total],
    ] as [string, Est][]).map(([e, x]) => [e, x.n, minutos(x.mediana), minutos(x.promedio), minutos(x.p90)]) },
    { grupo: 'Productos', titulo: 'Más vendidos', columnas: ['Producto', 'Unidades', 'Pedidos', 'Ventas'], filas: r.productos.masVendidos.map((p) => [p.nombre, p.unidades, p.pedidos, pesos(p.ventas)]) },
    { grupo: 'Productos', titulo: 'Menos vendidos', columnas: ['Producto', 'Unidades', 'Pedidos', 'Ventas'], filas: r.productos.menosVendidos.map((p) => [p.nombre, p.unidades, p.pedidos, pesos(p.ventas)]) },
    { grupo: 'Productos', titulo: 'Adiciones', columnas: ['Adición', 'Veces'], filas: r.productos.adiciones.map((a) => [a.nombre, a.veces]) },
    { grupo: 'Demanda', titulo: 'Por día', columnas: ['Fecha', 'Pedidos', 'Ventas'], filas: r.demanda.porFecha.map((d) => [d.fecha, d.pedidos, pesos(d.ventas)]) },
    { grupo: 'Demanda', titulo: 'Por día de la semana', columnas: ['Día', 'Pedidos', 'Ventas'], filas: [1, 2, 3, 4, 5, 6, 0].map((d) => r.demanda.porDiaSemana[d]).map((d) => [nombreDiaSemana(d.dia), d.pedidos, pesos(d.ventas)]) },
    { grupo: 'Demanda', titulo: 'Por hora', columnas: ['Hora', 'Pedidos', 'Ventas'], filas: r.demanda.porHora.filter((h) => h.pedidos).map((h) => [`${h.hora}:00`, h.pedidos, pesos(h.ventas)]) },
    { grupo: 'Clientes y fidelización', titulo: 'Clientes', columnas: ['Concepto', 'Valor'], filas: [
      ['Clientes con pedido entregado', r.clientes.conPedido], ['Nuevos', r.clientes.nuevos], ['Recurrentes', r.clientes.recurrentes],
      ['Pidieron más de una vez en el período', r.clientes.repitieronEnElPeriodo], ['Pedidos por cliente', r.clientes.pedidosPorCliente],
      ['Premios canjeados', r.clientes.premiosCanjeados],
    ] },
    { grupo: 'Domicilios', titulo: 'Por domiciliario', columnas: ['Domiciliario', 'Entregas', 'Fallidas', 'Entrega (mediana)', 'Entregas por día', 'Domicilios cobrados', 'Calificación'], filas: r.domicilios.porDomiciliario.map((d) => [d.nombre, d.entregas, d.fallidas, minutos(d.entregaMediana), d.entregasPorDia, pesos(d.domicilios), d.calificacion ?? '—']) },
    { grupo: 'Domicilios', titulo: 'Otros', columnas: ['Concepto', 'Valor'], filas: [['Recogidos en sede', r.domicilios.recogidasEnSede], ['Entregados sin domiciliario asignado', r.domicilios.sinDomiciliario]] },
    { grupo: 'Cancelaciones y reclamos', titulo: 'Cancelaciones por motivo', columnas: ['Motivo', 'Pedidos'], filas: r.incidencias.cancelaciones.porMotivo.map((m) => [m.motivo, m.n]) },
    { grupo: 'Cancelaciones y reclamos', titulo: 'Rechazos por motivo', columnas: ['Motivo', 'Pedidos'], filas: r.incidencias.rechazos.porMotivo.map((m) => [m.motivo, m.n]) },
    { grupo: 'Cancelaciones y reclamos', titulo: 'Reclamos', columnas: ['Concepto', 'Valor'], filas: [
      ['Reclamos', r.incidencias.reclamos.total], ['Abiertos', r.incidencias.reclamos.abiertos], ['Resueltos', r.incidencias.reclamos.resueltos],
      ['Horas hasta resolver (mediana)', r.incidencias.reclamos.horasResolucionMediana ?? '—'],
      ['Reembolsos autorizados', `${r.incidencias.reclamos.reembolsos.n} · ${pesos(r.incidencias.reclamos.reembolsos.monto)}`],
      ...r.incidencias.reclamos.porCategoria.map((c) => [`   ${c.categoria}`, c.n] as Celda[]),
    ] },
    { grupo: 'Cancelaciones y reclamos', titulo: 'Reclamos por motivo', columnas: ['Motivo', 'Reclamos'], filas: r.incidencias.reclamos.porMotivo.map((m) => [m.motivo, m.n]) },
    { grupo: 'Cancelaciones y reclamos', titulo: 'Productos en pedidos con reclamo', columnas: ['Producto', 'Reclamos'], filas: r.incidencias.reclamos.productosInvolucrados.map((p) => [p.nombre, p.n]) },
  ]
  if (!r.sedeId && r.porSede.length) T.splice(1, 0, { grupo: 'Financiero y operación', titulo: 'Por sede', columnas: ['Sede', 'Pedidos entregados', 'Ventas'], filas: r.porSede.map((s) => [nombreSede(s.sedeId), s.pedidos, pesos(s.ventas)]) })
  return T.filter((x) => x.filas.length)
}

export const tituloReporte = (r: Reporte) =>
  `Reporte DeliStars · ${nombreSede(r.sedeId)} · ${r.desde === r.hasta ? r.desde : `${r.desde} a ${r.hasta}`}`
const archivo = (r: Reporte, ext: string) => `reporte-${r.sedeId || 'dos-sedes'}-${r.desde}-a-${r.hasta}.${ext}`

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

export async function exportarExcel(r: Reporte): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DeliStars'; wb.created = new Date()
  const tablas = tablasDe(r)
  for (const grupo of [...new Set(tablas.map((t) => t.grupo))]) {
    const ws = wb.addWorksheet(grupo.slice(0, 31))
    ws.columns = [{ width: 42 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 14 }]
    ws.addRow([tituloReporte(r)]).font = { bold: true, size: 13 }
    ws.addRow([])
    for (const t of tablas.filter((x) => x.grupo === grupo)) {
      ws.addRow([t.titulo]).font = { bold: true, size: 12 }
      const enc = ws.addRow(t.columnas)
      enc.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } }
      t.filas.forEach((f) => ws.addRow(f))
      ws.addRow([])
    }
  }
  const notas = wb.addWorksheet('Cómo se calcula')
  notas.columns = [{ width: 120 }]
  r.formulas.forEach((f) => notas.addRow([f]))
  const buf = await wb.xlsx.writeBuffer()
  descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), archivo(r, 'xlsx'))
}

export async function exportarPDF(r: Reporte): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const margen = 36
  const alto = pdf.internal.pageSize.getHeight()
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14)
  pdf.text(tituloReporte(r), margen, margen + 4)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
  pdf.text(`Generado ${new Date(r.generadoAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, margen, margen + 18)
  let y = margen + 36
  let grupo = ''
  for (const t of tablasDe(r)) {
    if (y + 60 > alto - margen) { pdf.addPage(); y = margen + 4 }
    if (t.grupo !== grupo) {
      grupo = t.grupo
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
      pdf.text(grupo, margen, y); y += 16
    }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10)
    pdf.text(t.titulo, margen, y)
    autoTable(pdf, {
      startY: y + 6, margin: { left: margen, right: margen },
      head: [t.columnas], body: t.filas.map((f) => f.map(String)),
      theme: 'grid', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [26, 26, 26], textColor: 255 },
      didDrawPage: (d) => { y = d.cursor?.y ?? y },
    })
    y += 22
  }
  pdf.addPage()
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
  pdf.text('Cómo se calcula', margen, margen + 4)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  let yy = margen + 22
  for (const f of r.formulas) {
    const lineas = pdf.splitTextToSize(f, pdf.internal.pageSize.getWidth() - margen * 2)
    pdf.text(lineas, margen, yy); yy += lineas.length * 12 + 4
  }
  pdf.save(archivo(r, 'pdf'))
}
