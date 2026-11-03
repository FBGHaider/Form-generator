import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { masterRows, mergeSheets, parseMasterRows, sheetsToRead, type MasterParseResult } from './master'
import type { Car, Visit } from './db'
import { parseBackup, signInRows } from './backup'

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

/** Every sheet in an .xlsx file, as rows of cells. */
export async function readWorkbook(file: File): Promise<{ sheet: string; data: unknown[][] }[]> {
  return (await readXlsxFile(file)).map((s) => ({ sheet: s.sheet, data: s.data as unknown[][] }))
}

/** Everything on the phone in one file: the master list and every day's sign-ins. */
export async function backupToXlsx(cars: Car[], visits: Visit[]): Promise<Blob> {
  const bold = (rows: string[][]) => rows.map((r, i) => r.map((value) => (i === 0 ? { value, fontWeight: 'bold' as const } : { value })))
  return writeXlsxFile([
    { sheet: 'Master', data: bold(masterRows(cars)), columns: [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 14 }], stickyRowsCount: 1 },
    { sheet: 'Sign-ins', data: bold(signInRows(visits)), columns: [{ width: 13 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 14 }], stickyRowsCount: 1 },
  ]).toBlob()
}

export async function readBackupFile(file: File) {
  return parseBackup(await readWorkbook(file))
}
