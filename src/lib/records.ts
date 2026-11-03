import { db as defaultDb, type Car, type CarDetails, type RecordsDb, type Visit } from './db'
import { isValidTime, normaliseReg } from './format'

function clean(d: CarDetails): CarDetails {
  return {
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    company: d.company.trim(),
    toSee: d.toSee.trim(),
  }
}

function requireTime(t: string) {
  if (!isValidTime(t)) throw new Error(`"${t}" is not a 24-hour time like 07:00`)
}

export async function findCar(reg: string, db: RecordsDb = defaultDb): Promise<Car | undefined> {
  const r = normaliseReg(reg)
  return r ? db.cars.get(r) : undefined
}

/**
 * Master cars whose registration contains what has been typed — so the last
 * three characters ("WAE") find DN75WAE. Best matches first: plates that end
 * with it, then plates that start with it, then the rest; ties alphabetical.
 */
export function rankByReg<T extends { reg: string }>(cars: T[], typed: string, limit = 8): T[] {
  const q = normaliseReg(typed)
  if (!q) return []
  const rank = (reg: string) => (reg === q ? 0 : reg.endsWith(q) ? 1 : reg.startsWith(q) ? 2 : 3)
  return cars
    .filter((c) => c.reg.includes(q))
    .sort((a, b) => rank(a.reg) - rank(b.reg) || a.reg.localeCompare(b.reg))
    .slice(0, limit)
}

export async function suggestCars(typed: string, limit = 8, db: RecordsDb = defaultDb): Promise<Car[]> {
  // The master list is a few hundred cars at most, so scanning it is instant.
  return rankByReg(await db.cars.toArray(), typed, limit)
}

/** Add or update a car in the master list. */
export async function saveCar(reg: string, details: CarDetails, db: RecordsDb = defaultDb): Promise<Car> {
  const r = normaliseReg(reg)
  if (!r) throw new Error('Registration is empty')
  const car: Car = { reg: r, ...clean(details), updatedAt: Date.now() }
  await db.cars.put(car)
  return car
}

export async function deleteCar(reg: string, db: RecordsDb = defaultDb): Promise<void> {
  await db.cars.delete(normaliseReg(reg))
}

/** The car's sign-in today that has no time out yet, if any. */
export async function openVisit(reg: string, day: string, db: RecordsDb = defaultDb): Promise<Visit | undefined> {
  const r = normaliseReg(reg)
  const visits = await db.visits.where('day').equals(day).toArray()
  return visits.find((v) => v.reg === r && v.timeOut === '')
}

/**
 * Sign a car in. The details also go into the master list, so a new car is
 * remembered and a car whose details were "//" gets them once they are known.
 */
export async function signIn(
  reg: string,
  details: CarDetails,
  day: string,
  timeIn: string,
  db: RecordsDb = defaultDb,
): Promise<Visit> {
  requireTime(timeIn)
  const r = normaliseReg(reg)
  if (!r) throw new Error('Registration is empty')
  const d = clean(details)
  return db.transaction('rw', db.cars, db.visits, async () => {
    if (await openVisit(r, day, db)) throw new Error(`${r} is already signed in`)
    await db.cars.put({ reg: r, ...d, updatedAt: Date.now() })
    const visit: Omit<Visit, 'id'> = { day, reg: r, ...d, timeIn, timeOut: '', createdAt: Date.now() }
    const id = await db.visits.add(visit as Visit)
    return { ...visit, id } as Visit
  })
}

export async function signOut(id: number, timeOut: string, db: RecordsDb = defaultDb): Promise<void> {
  requireTime(timeOut)
  await db.visits.update(id, { timeOut })
}

/** Sign out every car still on site that day. Returns how many were signed out. */
export async function signOutEveryone(day: string, timeOut: string, db: RecordsDb = defaultDb): Promise<number> {
  requireTime(timeOut)
  return db.visits
    .where('day')
    .equals(day)
    .filter((v) => v.timeOut === '')
    .modify({ timeOut })
}

/** Correct a row: details, time in or time out. Details also update the master list. */
export async function updateVisit(
  id: number,
  patch: Partial<CarDetails & Pick<Visit, 'timeIn' | 'timeOut'>>,
  db: RecordsDb = defaultDb,
): Promise<void> {
  if (patch.timeIn !== undefined) requireTime(patch.timeIn)
  if (patch.timeOut !== undefined && patch.timeOut !== '') requireTime(patch.timeOut)
  await db.transaction('rw', db.cars, db.visits, async () => {
    const v = await db.visits.get(id)
    if (!v) throw new Error('That entry no longer exists')
    const next = { ...v, ...patch }
    const details = clean(next)
    await db.visits.put({ ...next, ...details })
    await db.cars.put({ reg: v.reg, ...details, updatedAt: Date.now() })
  })
}

export async function deleteVisit(id: number, db: RecordsDb = defaultDb): Promise<void> {
  await db.visits.delete(id)
}

/** A day's rows in the order they were signed in — the order they print in. */
export async function visitsFor(day: string, db: RecordsDb = defaultDb): Promise<Visit[]> {
  return db.visits.where('day').equals(day).sortBy('createdAt')
}

/** Every day that has at least one entry, newest first, with its row count. */
export async function daysWithVisits(db: RecordsDb = defaultDb): Promise<{ day: string; count: number }[]> {
  const counts = new Map<string, number>()
  await db.visits.each((v) => counts.set(v.day, (counts.get(v.day) ?? 0) + 1))
  return [...counts.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
}

/**
 * Fill in a driver's name once it is known: in the master list, and on every
 * row for that car on `day`, so that day's sheet prints the full name too.
 * Other details are kept as they are.
 */
export async function setDriverName(
  reg: string,
  firstName: string,
  lastName: string,
  day: string,
  db: RecordsDb = defaultDb,
): Promise<void> {
  const r = normaliseReg(reg)
  const name = { firstName: firstName.trim(), lastName: lastName.trim() }
  if (!name.lastName) throw new Error('Type the last name first')
  await db.transaction('rw', db.cars, db.visits, async () => {
    const car = await db.cars.get(r)
    await db.cars.put({ reg: r, company: '', toSee: '', ...car, ...name, updatedAt: Date.now() })
    await db.visits.where('day').equals(day).filter((v) => v.reg === r).modify(name)
  })
}

/** Past days are closed at this time: anyone left signed in is signed out. */
export const END_OF_DAY = '17:00'

/**
 * Sign out everyone still signed in on a day before `today`, at 17:00 — or at
 * their time in, for the rare car that came in after 17:00, so time out is
 * never before time in. Today is left alone. Returns how many were signed out.
 */
export async function closePastDays(today: string, db: RecordsDb = defaultDb): Promise<number> {
  return db.visits
    .where('day')
    .below(today)
    .filter((v) => v.timeOut === '')
    .modify((v) => {
      v.timeOut = v.timeIn > END_OF_DAY ? v.timeIn : END_OF_DAY
    })
}
