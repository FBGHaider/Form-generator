import type { CarDetails, RecordsDb, Visit } from './db'
import { db as defaultDb } from './db'
import { dayKey, longDay, normaliseReg } from './format'
import { detail, key, looksLikeReg, matchHeader, text } from './master'

/** One row of a day's sheet, as written in Excel. */
export interface SheetEntry extends CarDetails {
  reg: string
  timeIn: string // "07:00", or "" when the row has no time in
  timeOut: string
}

export interface DaySheet {
  /** The day named in the sheet's "Date:" line, if it has one ("2026-11-03"). */
  day: string | null
  entries: SheetEntry[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Date: 03 November 2026" or a sheet named "3 November 2026" -> "2026-11-03". */
export function findDay(textValue: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(textValue)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
  if (month === -1) return null
  return dayKey(new Date(Number(m[3]), month, Number(m[1])))
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A time from a spreadsheet cell, as "07:00". Excel times arrive as a Date on
 * 30 Dec 1899 (read in UTC), as a fraction of a day, or as text like "7:00"
 * or "7.00" when pasted. Anything else is "".
 */
export function cellTime(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60)
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`
  }
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(text(v))
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : ''
}

const TIME_IN = ['timein', 'in', 'arrived', 'arrival', 'timearrived']
const TIME_OUT = ['timeout', 'out', 'left', 'departed', 'departure', 'timeleft']

/** Read a day's sheet: the heading row, then one row per vehicle. */
export function parseDaySheet(rows: unknown[][]): DaySheet {
  const headerIndex = rows.slice(0, 10).findIndex((r) => matchHeader(r).reg !== undefined)
  if (headerIndex === -1) throw new Error('Could not find a "Registration" heading in the first ten rows.')
  const header = rows[headerIndex]
  const cols = matchHeader(header)
  const inCol = header.findIndex((h) => TIME_IN.includes(key(h)))
  const outCol = header.findIndex((h) => TIME_OUT.includes(key(h)))
  if (inCol === -1) throw new Error('Could not find a "Time in" heading.')

  let day: string | null = null
  for (const r of rows.slice(0, headerIndex)) day ??= findDay(r.map(text).join(' '))

  const entries: SheetEntry[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const at = (i: number | undefined) => (i === undefined || i < 0 ? '' : detail(row[i]))
    const reg = normaliseReg(text(cols.reg === undefined ? '' : row[cols.reg]))
    if (!looksLikeReg(reg)) continue
    let firstName = at(cols.firstName)
    let lastName = at(cols.lastName)
    if (cols.firstName === undefined && cols.lastName === undefined) {
      const full = at(cols.fullName)
      const space = full.indexOf(' ')
      firstName = space === -1 ? full : full.slice(0, space)
      lastName = space === -1 ? '' : full.slice(space + 1).trim()
    }
    entries.push({
      reg, firstName, lastName, company: at(cols.company), toSee: at(cols.toSee),
      timeIn: cellTime(row[inCol]), timeOut: outCol === -1 ? '' : cellTime(row[outCol]),
    })
  }
  return { day, entries }
}

/** Rows pasted from Excel arrive as tab-separated text, one row per line. */
export function parsePastedRows(pasted: string): string[][] {
  return pasted.replace(/\r/g, '').split('\n').map((line) => line.split('\t'))
}

export interface DayImportResult {
  added: number
  /** Already on the day's sheet at the same time in; nothing changed. */
  alreadyIn: number
  /** Already on the sheet and now given the time out from the import. */
  signedOut: number
  /** Signed in on the phone at a different time and still on site; left alone. */
  onSiteAlready: string[]
  /** Rows with no time in: not on site, so not put on the day's sheet. */
  noTimeIn: number
  /** Cars that were not in the master list and have been added to it. */
  newCars: string[]
}

/**
 * Put a day's sheet into the app. Rows with a time in become that day's
 * sign-ins (signed out too if they have a time out). Importing the same sheet
 * again later is safe: rows already brought in are not added twice, and a
 * time out written in since is filled in.
 *
 * The master list is kept as the better source of who a car belongs to: a
 * row only fills in details the master list does not have, and (unless
 * `updateMaster` is false) cars not in the master list are added to it.
 */
export async function importDaySheet(
  day: string,
  entries: SheetEntry[],
  db: RecordsDb = defaultDb,
  options: { updateMaster?: boolean } = {},
): Promise<DayImportResult> {
  // Old sheets carry typo plates and old spellings that were cleaned out of
  // the master list, so importing a past day leaves the master list alone.
  const updateMaster = options.updateMaster ?? true
  const result: DayImportResult = { added: 0, alreadyIn: 0, signedOut: 0, onSiteAlready: [], noTimeIn: 0, newCars: [] }
  const fields = ['firstName', 'lastName', 'company', 'toSee'] as const

  await db.transaction('rw', db.cars, db.visits, async () => {
    const now = Date.now()
    // In time order, so the day prints in the order vehicles arrived.
    const ordered = entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.timeIn || '99').localeCompare(b.e.timeIn || '99') || a.i - b.i)
    const existing = await db.visits.where('day').equals(day).toArray()
    let seq = 0

    for (const { e } of ordered) {
      // Master list: add new cars, fill in what it is missing, never overwrite.
      const car = await db.cars.get(e.reg)
      const details = Object.fromEntries(fields.map((f) => [f, car?.[f] || e[f]])) as unknown as CarDetails
      if (updateMaster) {
        if (!car) result.newCars.push(e.reg)
        if (!car || fields.some((f) => !car[f] && e[f])) await db.cars.put({ reg: e.reg, ...details, updatedAt: now })
      }

      if (!e.timeIn) {
        result.noTimeIn++
        continue
      }
      const same = existing.find((v) => v.reg === e.reg && v.timeIn === e.timeIn)
      if (same) {
        // Fill in a time out — or replace the app's automatic 17:00 with a
        // real one, e.g. from a colleague's handover the next morning.
        const better = e.timeOut && (!same.timeOut || (same.autoOut && e.timeOut !== same.timeOut))
        if (better) {
          await db.visits.update(same.id, { timeOut: e.timeOut, autoOut: false })
          same.timeOut = e.timeOut
          same.autoOut = false
          result.signedOut++
        } else {
          result.alreadyIn++
        }
        continue
      }
      if (existing.some((v) => v.reg === e.reg && v.timeOut === '')) {
        result.onSiteAlready.push(e.reg)
        continue
      }
      const visit: Omit<Visit, 'id'> = { day, reg: e.reg, ...details, timeIn: e.timeIn, timeOut: e.timeOut, createdAt: now + seq++ }
      const id = await db.visits.add(visit as Visit)
      existing.push({ ...visit, id } as Visit)
      result.added++
    }
  })
  return result
}

export interface DayTab {
  sheet: string
  /** The day this tab is for, or null when neither its name nor its "Date:" line says. */
  day: string | null
  /** Set when the tab name and the "Date:" line disagree; the tab name is used. */
  dateNote?: string
  entries: SheetEntry[]
  /** Rows with a time in — the ones that will be imported. */
  signedIn: number
}

/**
 * Every tab of a workbook of daily sheets, with the day it is for. The tab
 * name wins over the "Date:" line, because a tab is often copied from the day
 * before and its Date line left unchanged. Tabs that are not day sheets (no
 * Registration or Time in column) are left out.
 */
export function readDayTabs(book: { sheet: string; data: unknown[][] }[]): DayTab[] {
  const tabs: DayTab[] = []
  for (const { sheet, data } of book) {
    let parsed: DaySheet
    try {
      parsed = parseDaySheet(data)
    } catch {
      continue
    }
    const fromName = findDay(sheet)
    const day = fromName ?? parsed.day
    const dateNote = fromName && parsed.day && fromName !== parsed.day
      ? `The tab is named ${sheet} but its Date line says ${longDay(parsed.day)}; using the tab name.`
      : undefined
    tabs.push({ sheet, day, dateNote, entries: parsed.entries, signedIn: parsed.entries.filter((e) => e.timeIn).length })
  }
  return tabs
}
