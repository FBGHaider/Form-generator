import { db } from './db'
import { fileDay, longDay } from './format'
import { visitsFor } from './records'
import { shareFiles, type ShareOutcome } from './share'

const KEY = 'last-sent-day'

/** The last day whose end-of-day files were sent (this phone only). */
export function lastSentDay(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function markSent(day: string) {
  try {
    localStorage.setItem(KEY, day)
  } catch {
    // Private mode or blocked storage: the reminder just shows again.
  }
}

/** The whole backup file: master list and every day. */
export async function backupFile(day: string) {
  const { backupToXlsx } = await import('./excel')
  const blob = await backupToXlsx(await db.cars.toArray(), await db.visits.toArray())
  return { blob, name: `Vehicle_Records_backup_${fileDay(day)}.xlsx` }
}

/**
 * The end of the day: today's sheet as a PDF, and the backup (master list plus
 * every day) as Excel, handed to the share sheet together — tap Mail to email
 * them. Counts as a backup too.
 */
export async function sendEndOfDay(day: string): Promise<ShareOutcome> {
  const { dayPdfBlob, pdfFileName } = await import('./pdf')
  const pdf = { blob: dayPdfBlob(day, await visitsFor(day)), name: pdfFileName(day) }
  const outcome = await shareFiles([pdf, await backupFile(day)], `Vehicle Records ${longDay(day)}`)
  if (outcome !== 'cancelled') markSent(day)
  return outcome
}

/** Just the backup file, to save to Files / iCloud Drive or email. */
export async function sendBackup(day: string): Promise<ShareOutcome> {
  const outcome = await shareFiles([await backupFile(day)], `Vehicle Records backup ${longDay(day)}`)
  if (outcome !== 'cancelled') markSent(day)
  return outcome
}
