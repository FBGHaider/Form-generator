import Dexie, { type EntityTable } from 'dexie'

/** A car in the master list. One row per registration. */
export interface Car {
  reg: string
  firstName: string
  lastName: string
  company: string
  toSee: string
  updatedAt: number
}

/** One sign-in on one day: a row on that day's printed sheet. */
export interface Visit {
  id: number
  day: string // "2026-10-28"
  reg: string
  firstName: string
  lastName: string
  company: string
  toSee: string
  timeIn: string // "07:00"
  timeOut: string // "17:00", or "" while still on site
  /** True when the time out was filled in by the app (17:00 on a past day), not by a person. */
  autoOut?: boolean
  createdAt: number
}

export type CarDetails = Pick<Car, 'firstName' | 'lastName' | 'company' | 'toSee'>

export class RecordsDb extends Dexie {
  cars!: EntityTable<Car, 'reg'>
  visits!: EntityTable<Visit, 'id'>

  constructor(name = 'vehicle-records') {
    super(name)
    this.version(1).stores({
      cars: '&reg, updatedAt',
      visits: '++id, day, reg, createdAt',
    })
  }
}

export const db = new RecordsDb()

/**
 * Ask the browser to never clear this app's data on its own. On iPhone this
 * matters most: data for a site opened in Safari can be cleared after a few
 * weeks of not being used, but an app on the Home Screen is kept.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
