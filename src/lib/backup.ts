import type { Car, RecordsDb, Visit } from './db'
import { db as defaultDb } from './db'
import { importDaySheet, parseDaySheet, type SheetEntry } from './daySheet'
import { dayKey, longDay } from './format'
import { MASTER_HEADINGS, masterRows, parseMasterRows, sheetsToRead } from './master'

/*
 * A backup is one Excel file with two sheets:
 *   "Master"   — the master list, the same layout as "Export to Excel", so the
 *                backup can also be imported as a master list on its own.
 *   "Sign-ins" — every row of every day: Date, then the day sheet's columns.
 * Times and dates are written as text ("07:00", "3 Nov 2026") so they read
 * back exactly and look right in Excel.
 */

export const SIGNIN_HEADINGS = ['Date', 'First name', 'Last name', 'Company', 'To see', 'Time in', 'Time out', 'Registration'] as const

export function signInRows(visits: Visit[]): string[][] {
  const sorted = [...visits].sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt)
  return [
    [...SIGNIN_HEADINGS],
    ...sorted.map((v) => [longDay(v.day), v.firstName, v.lastName, v.company, v.toSee, v.timeIn, v.timeOut, v.reg]),
  ]
}

export interface BackupContents {
  cars: Omit<Car, 'updatedAt'>[]
  /** Sign-ins grouped by day ("2026-11-03"). */
  days: Map<string, SheetEntry[]>
}

/** Read the sheets of a backup file. A file with only a Master sheet restores just the master list. */
export function parseBackup(sheets: { sheet: string; data: unknown[][] }[]): BackupContents {
  const master = sheetsToRead(sheets).find((s) => s.sheet.trim().toLowerCase() === 'master')
  if (!master) throw new Error('This is not a backup file: it has no "Master" sheet.')
  const cars = parseMasterRows(master.data).cars

  const days = new Map<string, SheetEntry[]>()
  const signIns = sheets.find((s) => s.sheet.trim().toLowerCase() === 'sign-ins')
  if (signIns) {
    // Group the rows by their Date, then read each day with the day-sheet reader.
    const [header = [], ...rows] = signIns.data
    const dateCol = header.findIndex((h) => String(h ?? '').trim().toLowerCase() === 'date')
    if (dateCol === -1) throw new Error('The "Sign-ins" sheet has no "Date" column.')
    const byDay = new Map<string, unknown[][]>()
    for (const row of rows) {
      const day = dateKeyOf(row[dateCol])
      if (!day) continue
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(row)
    }
    for (const [day, dayRows] of byDay) {
      const entries = parseDaySheet([header, ...dayRows]).entries
      if (entries.length > 0) days.set(day, entries)
    }
  }
  return { cars, days }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
function dateKeyOf(v: unknown): string | null {
  if (v instanceof Date) return dayKey(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()))
  const m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(String(v ?? ''))
  if (!m) return null
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
  return month === -1 ? null : dayKey(new Date(Number(m[3]), month, Number(m[1])))
}

export interface RestoreResult {
  carsAdded: number
  days: number
  signInsAdded: number
}

/**
 * Put a backup back. Nothing on the phone is overwritten or removed: cars
 * missing from the master list are added and empty details filled in, and
 * sign-ins not already on a day are added. Restoring the same backup twice
 * changes nothing the second time.
 */
export async function restoreBackup(backup: BackupContents, db: RecordsDb = defaultDb): Promise<RestoreResult> {
  const fields = ['firstName', 'lastName', 'company', 'toSee'] as const
  let carsAdded = 0
  await db.transaction('rw', db.cars, async () => {
    for (const c of backup.cars) {
      const have = await db.cars.get(c.reg)
      if (!have) {
        await db.cars.put({ ...c, updatedAt: Date.now() })
        carsAdded++
      } else if (fields.some((f) => !have[f] && c[f])) {
        await db.cars.put({ ...have, ...Object.fromEntries(fields.map((f) => [f, have[f] || c[f]])), updatedAt: Date.now() })
      }
    }
  })
  let signInsAdded = 0
  for (const [day, entries] of backup.days) {
    // The backup's Master sheet is the master list; sign-ins do not add to it.
    const r = await importDaySheet(day, entries, db, { updateMaster: false })
    signInsAdded += r.added
  }
  return { carsAdded, days: backup.days.size, signInsAdded }
}

export { MASTER_HEADINGS, masterRows }
