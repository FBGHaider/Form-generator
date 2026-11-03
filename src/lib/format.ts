import { UNKNOWN } from '../config'

/** "dn75 wae" -> "DN75WAE". Registrations are stored and compared in this form. */
export function normaliseReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** An empty detail prints as "//" — the driver's details are not known yet. */
export function orUnknown(value: string | undefined | null): string {
  const v = (value ?? '').trim()
  return v === '' ? UNKNOWN : v
}

/** First and last name as printed in the single "Name" column. */
export function displayName(firstName: string, lastName: string): string {
  const parts = [firstName, lastName]
    .map((p) => p.trim())
    .filter((p) => p !== '' && p !== UNKNOWN)
  return parts.length === 0 ? UNKNOWN : parts.join(' ')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as "2026-10-28". Each day is its own sheet. */
export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The current time on a 24-hour clock, "07:05". This is how times are stored. */
export function timeNow(date: Date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}

/** "07:05" -> "7:05", the way the paper sheet writes times. Empty stays empty. */
export function printTime(t: string): string {
  return isValidTime(t) ? t.replace(/^0(\d)/, '$1') : ''
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseDay(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

/** "2026-10-28" -> "28 Oct 2026" */
export function longDay(key: string): string {
  const [y, m, d] = parseDay(key)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "2026-10-28" -> "28_Oct_2026", used for file names. */
export function fileDay(key: string): string {
  return longDay(key).replace(/ /g, '_')
}
