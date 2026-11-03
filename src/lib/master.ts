import type { Car, CarDetails, RecordsDb } from './db'
import { db as defaultDb } from './db'
import { normaliseReg } from './format'

export type Field = 'reg' | 'firstName' | 'lastName' | 'fullName' | 'company' | 'toSee'

// Header text is compared lower-case with everything but letters and digits
// removed, so "First Name", "first_name" and "FIRSTNAME" all match.
export const HEADERS: Record<Field, string[]> = {
  reg: ['registration', 'reg', 'regno', 'registrationnumber', 'carreg', 'carregistration', 'vehiclereg', 'vehicleregistration', 'vrm', 'numberplate', 'plate'],
  firstName: ['firstname', 'first', 'forename', 'givenname', 'firstnameoftheowner', 'ownerfirstname'],
  lastName: ['lastname', 'last', 'surname', 'secondname', 'familyname', 'lastnameoftheowner', 'ownerlastname', 'ownersurname'],
  fullName: ['name', 'fullname', 'owner', 'ownername', 'driver', 'drivername'],
  company: ['company', 'companyname', 'employer', 'companytheyworkwith', 'companytheyworkfor', 'from'],
  toSee: ['tosee', 'companytosee', 'visiting', 'seeing', 'host', 'companytheywanttosee', 'companyvisiting'],
}

export const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
/** "//" in the sheet means "not known yet"; it is stored as empty and prints as "//". */
export const detail = (v: unknown) => (text(v) === '//' ? '' : text(v))

/**
 * A registration is 2–8 letters and digits with at least one letter. This
 * keeps out things in the Registration column that are not cars, like the
 * "37" on the "Total people on site today" row, while still allowing private
 * plates such as "GIJPN".
 */
export function looksLikeReg(reg: string): boolean {
  return /^[A-Z0-9]{2,8}$/.test(reg) && /[A-Z]/.test(reg)
}

export interface MasterParseResult {
  cars: Omit<Car, 'updatedAt'>[]
  /** Which spreadsheet heading was used for each detail. */
  columns: Partial<Record<Field, string>>
  /** Rows that had no registration and were left out. */
  skipped: number
  /** Registrations that appeared more than once; the last row wins. */
  duplicates: string[]
}

export function matchHeader(row: unknown[]): Partial<Record<Field, number>> {
  const found: Partial<Record<Field, number>> = {}
  row.forEach((cell, i) => {
    const k = key(cell)
    for (const field of Object.keys(HEADERS) as Field[]) {
      if (found[field] === undefined && HEADERS[field].includes(k)) found[field] = i
    }
  })
  return found
}

/**
 * Turn the rows of a spreadsheet into master-list cars. The heading row is
 * found automatically (it is the first row, within the first ten, that has a
 * registration heading). Time in / time out columns are ignored: the master
 * list is who the cars belong to, not when they came.
 */
export function parseMasterRows(rows: unknown[][]): MasterParseResult {
  const headerIndex = rows.slice(0, 10).findIndex((r) => matchHeader(r).reg !== undefined)
  if (headerIndex === -1) {
    throw new Error('Could not find a "Registration" heading in the first ten rows of the sheet.')
  }
  const cols = matchHeader(rows[headerIndex])
  const header = rows[headerIndex]
  const columns: MasterParseResult['columns'] = {}
  for (const [field, i] of Object.entries(cols) as [Field, number][]) columns[field] = text(header[i])

  const byReg = new Map<string, Omit<Car, 'updatedAt'>>()
  const duplicates = new Set<string>()
  let skipped = 0

  for (const row of rows.slice(headerIndex + 1)) {
    const at = (f: Field) => (cols[f] === undefined ? '' : detail(row[cols[f]!]))
    const reg = normaliseReg(text(cols.reg === undefined ? '' : row[cols.reg]))
    const isTotal = /^total/i.test(text(row[0]))
    if (!looksLikeReg(reg)) {
      if (!isTotal && row.some((c) => text(c) !== '')) skipped++
      continue
    }
    let firstName = at('firstName')
    let lastName = at('lastName')
    if (cols.firstName === undefined && cols.lastName === undefined) {
      const full = at('fullName')
      const space = full.indexOf(' ')
      firstName = space === -1 ? full : full.slice(0, space)
      lastName = space === -1 ? '' : full.slice(space + 1).trim()
    }
    if (byReg.has(reg)) duplicates.add(reg)
    byReg.set(reg, { reg, firstName, lastName, company: at('company'), toSee: at('toSee') })
  }

  return { cars: [...byReg.values()], columns, skipped, duplicates: [...duplicates] }
}

/**
 * Which sheets of a workbook to read. A sheet called "Master" is the master
 * list on its own — the other sheets beside it are notes — so it is the only
 * one read. Otherwise every sheet is read (the workbook is one sheet per day).
 */
export function sheetsToRead<S extends { sheet: string }>(sheets: S[]): S[] {
  const master = sheets.filter((s) => s.sheet.trim().toLowerCase() === 'master')
  return master.length > 0 ? master : sheets
}

type ImportedCar = Omit<Car, 'updatedAt'>
const DETAILS = ['firstName', 'lastName', 'company', 'toSee'] as const

/**
 * Combine several sheets into one master list. Sheets are given oldest first
 * (workbook order). For each car, every detail comes from the newest sheet
 * that has it filled in, so a name written in properly on a later day wins,
 * and a detail left blank on a later day does not wipe out an earlier one.
 */
export function mergeSheets(sheets: ImportedCar[][]): ImportedCar[] {
  const byReg = new Map<string, ImportedCar>()
  for (const cars of sheets) {
    for (const car of cars) {
      const prev = byReg.get(car.reg)
      if (!prev) {
        byReg.set(car.reg, { ...car })
        continue
      }
      for (const k of DETAILS) if (car[k] !== '') prev[k] = car[k]
    }
  }
  return [...byReg.values()].sort((a, b) => a.reg.localeCompare(b.reg))
}

/**
 * Put imported cars into the master list. A car already in the list is
 * updated from the file; cars added on the phone that are not in the file
 * are kept.
 */
export async function importCars(
  cars: Omit<Car, 'updatedAt'>[],
  db: RecordsDb = defaultDb,
): Promise<{ added: number; updated: number }> {
  const now = Date.now()
  return db.transaction('rw', db.cars, async () => {
    const existing = new Set((await db.cars.bulkGet(cars.map((c) => c.reg))).filter(Boolean).map((c) => c!.reg))
    await db.cars.bulkPut(cars.map((c) => ({ ...c, updatedAt: now })))
    return { added: cars.length - existing.size, updated: existing.size }
  })
}

export const MASTER_HEADINGS = ['Registration', 'First name', 'Last name', 'Company', 'To see'] as const

/** The master list as spreadsheet rows, heading first, sorted by registration. */
export function masterRows(cars: (CarDetails & { reg: string })[]): string[][] {
  const sorted = [...cars].sort((a, b) => a.reg.localeCompare(b.reg))
  return [
    [...MASTER_HEADINGS],
    ...sorted.map((c) => [c.reg, c.firstName, c.lastName, c.company, c.toSee]),
  ]
}
