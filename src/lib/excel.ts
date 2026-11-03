import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { masterRows, parseMasterRows, type MasterParseResult } from './master'
import type { Car } from './db'

/**
 * Read a master list from an .xlsx file. If the workbook has several sheets,
 * the first one with a "Registration" heading is used.
 */
export async function readMasterFile(file: File): Promise<MasterParseResult & { sheet: string }> {
  const sheets = await readXlsxFile(file)
  let firstError: unknown
  for (const s of sheets) {
    try {
      return { ...parseMasterRows(s.data as unknown[][]), sheet: s.sheet }
    } catch (e) {
      firstError ??= e
    }
  }
  throw firstError ?? new Error('The file has no sheets.')
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
