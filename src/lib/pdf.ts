import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { SITE_TITLE } from '../config'
import type { Visit } from './db'
import { displayName, fileDay, longDay, orUnknown, printTime } from './format'

export const SHEET_HEADINGS = ['Name', 'Company', 'To see', 'Time in', 'Time out', 'Registration'] as const

/** One printed row per sign-in, exactly as it appears on the sheet. */
export function sheetRows(visits: Visit[]): string[][] {
  return visits.map((v) => [
    displayName(v.firstName, v.lastName),
    orUnknown(v.company),
    orUnknown(v.toSee),
    printTime(v.timeIn),
    printTime(v.timeOut),
    v.reg,
  ])
}

export function pdfFileName(day: string): string {
  return `${fileDay(day)}.pdf`
}

// Column widths in points, in the same proportions as the paper sheet.
// A4 is 595pt wide; with 30pt margins the table is 535pt.
const WIDTHS = [135, 125, 80, 55, 55, 85]
const MARGIN = 30

/** The day's sheet on A4: date, title, the table, then the total box. */
export function buildDayPdf(day: string, visits: Visit[]): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  doc.setProperties({ title: `${SITE_TITLE} - ${longDay(day)}` })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Date: ${longDay(day)}`, MARGIN, 50)
  doc.setFontSize(14)
  doc.text(SITE_TITLE, pageWidth / 2, 72, { align: 'center' })

  const lines = { lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.6 }
  const columnStyles = Object.fromEntries(WIDTHS.map((w, i) => [i, { cellWidth: w }]))

  autoTable(doc, {
    startY: 80,
    margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 40 },
    head: [[...SHEET_HEADINGS]],
    body: sheetRows(visits),
    theme: 'grid',
    showHead: 'everyPage',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      halign: 'center',
      valign: 'middle',
      textColor: [0, 0, 0],
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      ...lines,
    },
    headStyles: { fillColor: [255, 255, 255], fontStyle: 'bold', ...lines },
    columnStyles,
  })

  // "Total people on site today" box, a little below the table.
  const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const totalWidth = WIDTHS.slice(-1)[0]
  autoTable(doc, {
    startY: after + 16,
    margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 40 },
    body: [['Total people on site today', String(visits.length)]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 11, halign: 'center', textColor: [0, 0, 0], ...lines },
    columnStyles: { 1: { cellWidth: totalWidth } },
    pageBreak: 'avoid',
  })

  return doc
}

export function dayPdfBlob(day: string, visits: Visit[]): Blob {
  return buildDayPdf(day, visits).output('blob')
}
