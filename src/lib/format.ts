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

/** The Monday of the week `day` falls in, as a day key. Weeks run Monday to Sunday. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const back = (date.getDay() + 6) % 7 // Monday 0 … Sunday 6
  date.setDate(date.getDate() - back)
  return dayKey(date)
}

/** The day `n` days after `day` (negative for before). */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

/** "Tuesday 3 Nov 2026" */
export function weekdayDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(y, m - 1, d).getDay()]
  return `${name} ${longDay(day)}`
}

/** "26 Oct – 1 Nov 2026" for the Monday-to-Sunday week starting on `monday`. */
export function weekLabel(monday: string): string {
  const sunday = shiftDay(monday, 6)
  const [, , d1] = monday.split('-').map(Number)
  const m1 = longDay(monday).split(' ')[1]
  const [y2] = sunday.split('-').map(Number)
  const sameYear = Number(monday.slice(0, 4)) === y2
  const start = sameYear ? `${d1} ${m1}` : longDay(monday)
  return `${start} – ${longDay(sunday)}`
}

/** Days grouped into Monday-to-Sunday weeks, keeping their order. */
export function groupByWeek<T extends { day: string }>(days: T[]): { monday: string; days: T[] }[] {
  const groups: { monday: string; days: T[] }[] = []
  for (const d of days) {
    const monday = weekStart(d.day)
    const last = groups[groups.length - 1]
    if (last && last.monday === monday) last.days.push(d)
    else groups.push({ monday, days: [d] })
  }
  return groups
}
