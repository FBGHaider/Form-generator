import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { masterRows, mergeSheets, parseMasterRows, sheetsToRead, type MasterParseResult } from './master'
import type { Car } from './db'

export interface MasterFileResult {
  cars: Omit<Car, 'updatedAt'>[]
  /** Names of the sheets that were read, oldest first. */
  sheets: string[]
  /** Sheets with no "Registration" heading, left out. */
  ignored: string[]
  /** Non-empty rows with no proper registration, across all sheets. */
  skipped: number
}

/**
 * Read a master list from an .xlsx file. If the workbook has a sheet called
 * "Master", only that sheet is read. Otherwise every sheet with a
 * "Registration" heading is read — the workbook is one sheet per day — and
 * they are combined, newest sheet winning, so cars seen on any day are all in
 * the master list.
 */
export async function readMasterFile(file: File): Promise<MasterFileResult> {
  const all = sheetsToRead(await readXlsxFile(file))
  const parsed: MasterParseResult[] = []
  const sheets: string[] = []
  const ignored: string[] = []
  for (const s of all) {
    try {
      parsed.push(parseMasterRows(s.data as unknown[][]))
      sheets.push(s.sheet)
    } catch {
      ignored.push(s.sheet)
    }
  }
  if (parsed.length === 0) throw new Error('No sheet in this file has a "Registration" heading.')
  return {
    cars: mergeSheets(parsed.map((p) => p.cars)),
    sheets,
    ignored,
    skipped: parsed.reduce((n, p) => n + p.skipped, 0),
  }
}

export async function masterToXlsx(cars: Car[]): Promise<Blob> {
  const rows = masterRows(cars)
  const data = rows.map((r, i) =>
    r.map((value) => (i === 0 ? { value, fontWeight: 'bold' as const } : { value })),
  )
  return writeXlsxFile(data, {
    sheet: 'Master',
    columns: [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 14 }],
    stickyRowsCount: 1,
  }).toBlob()
}
