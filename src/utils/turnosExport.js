// ─── Exportar el historial de turnos (Excel y PDF) ───────────────────────────
// ESPEJO: delistars-menu-magic/admin/src/lib/turnosExport.ts. Mantener iguales.
// Las librerías se cargan solo al exportar, para no engordar la página.
//
// `semanas` = [{ lunes: 'yyyy-mm-dd', filas }] donde `filas` sale de
// filasSemana() o es null si esa semana no tiene cuadro publicado.
import { DIAS, etiquetaSemana, fechaCorta } from './turnos'

const DIA_CORTO = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' }

// Colores de cada turno, los mismos del cuadro en pantalla (RGB).
const COLOR = {
  santa_lucia:    [250, 219, 222],
  santa_teresita: [214, 243, 233],
  descanso:       [236, 236, 236],
  trabajo:        [255, 239, 196],
}
const hex = ([r, g, b]) => [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()

const textoCelda = (c) => (c.valor ? c.etiqueta + (c.caja ? ' · Caja' : '') : '')
const encabezado = (lunes) => ['Empleado', ...DIAS.map((d) => `${DIA_CORTO[d]} ${fechaCorta(lunes, d)}`)]

export const tituloHistorial = (semanas) => {
  const primera = semanas[0].lunes
  const ultima = semanas[semanas.length - 1].lunes
  return semanas.length === 1
    ? `Turnos de la semana del ${etiquetaSemana(primera)}`
    : `Turnos de la semana del ${etiquetaSemana(primera)} a la semana del ${etiquetaSemana(ultima)}`
}

const nombreArchivo = (semanas, ext) =>
  `turnos-${semanas[0].lunes}-a-${semanas[semanas.length - 1].lunes}.${ext}`

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportarExcel(semanas) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DeliStars'
  wb.created = new Date()
  const ws = wb.addWorksheet('Historial de turnos')
  ws.columns = [{ width: 18 }, ...DIAS.map(() => ({ width: 19 }))]

  ws.addRow([tituloHistorial(semanas)]).font = { bold: true, size: 14 }
  ws.addRow([])

  semanas.forEach(({ lunes, filas }) => {
    ws.addRow([`Semana del ${etiquetaSemana(lunes)}`]).font = { bold: true, size: 12 }
    if (!filas) {
      ws.addRow(['Sin cuadro publicado']).font = { italic: true, color: { argb: 'FF888888' } }
      ws.addRow([])
      return
    }
    const enc = ws.addRow(encabezado(lunes))
    enc.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } }
    filas.forEach((f) => {
      const row = ws.addRow([f.short, ...DIAS.map((d) => textoCelda(f.dias[d]))])
      DIAS.forEach((d, i) => {
        const c = f.dias[d]
        const cell = row.getCell(i + 2)
        if (COLOR[c.valor]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(COLOR[c.valor])}` } }
        if (c.caja) cell.font = { bold: true }
      })
    })
    ws.addRow([])
  })

  const buf = await wb.xlsx.writeBuffer()
  descargar(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nombreArchivo(semanas, 'xlsx'),
  )
}

export async function exportarPDF(semanas) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const margen = 36
  const alto = pdf.internal.pageSize.getHeight()

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text(tituloHistorial(semanas), margen, margen + 4)
  let y = margen + 30

  semanas.forEach(({ lunes, filas }) => {
    // Título y tabla van juntos: si la semana no cabe entera, pasa a la otra
    // página (cada fila mide ~18 pt con letra de 8).
    const necesario = filas ? 30 + (filas.length + 1) * 20 : 30
    if (y + necesario > alto - margen) { pdf.addPage(); y = margen + 4 }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text(`Semana del ${etiquetaSemana(lunes)}`, margen, y)
    if (!filas) {
      pdf.setFont('helvetica', 'italic')
      pdf.setFontSize(9)
      pdf.text('Sin cuadro publicado', margen, y + 16)
      y += 40
      return
    }
    autoTable(pdf, {
      startY: y + 8,
      margin: { left: margen, right: margen },
      head: [encabezado(lunes)],
      body: filas.map((f) => [f.short, ...DIAS.map((d) => textoCelda(f.dias[d]))]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [26, 26, 26], textColor: 255 },
      columnStyles: { 0: { fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index === 0) return
        const c = filas[data.row.index].dias[DIAS[data.column.index - 1]]
        if (COLOR[c.valor]) data.cell.styles.fillColor = COLOR[c.valor]
        if (c.caja) data.cell.styles.fontStyle = 'bold'
      },
      didDrawPage: (data) => { y = data.cursor?.y ?? y },
    })
    y += 28
  })

  pdf.save(nombreArchivo(semanas, 'pdf'))
}
