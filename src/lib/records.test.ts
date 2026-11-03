import { beforeEach, describe, expect, it } from 'vitest'
import { RecordsDb } from './db'
import {
  closePastDays, daysWithVisits, deleteDays, endOfDayFor, findCar, openVisit, rankByReg, setDriverName, signIn, signOut, signOutEveryone, suggestCars, updateVisit, visitsFor,
} from './records'

const DAY = '2026-10-28'
const tom = { firstName: 'Tom', lastName: '', company: 'Spencer', toSee: 'Spencer' }
const unknown = { firstName: '//', lastName: '', company: '//', toSee: 'Spencer' }

let db: RecordsDb
beforeEach(async () => {
  db = new RecordsDb(`test-${Math.random()}`)
  await db.open()
})

describe('records', () => {
  it('signing in a new car adds it to the day and to the master list', async () => {
    await signIn('dn75 wae', tom, DAY, '07:00', db)
    expect(await findCar('DN75WAE', db)).toMatchObject({ reg: 'DN75WAE', firstName: 'Tom' })
    const rows = await visitsFor(DAY, db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ reg: 'DN75WAE', timeIn: '07:00', timeOut: '' })
  })

  it('keeps // details for a driver who is not known yet', async () => {
    await signIn('LB23YJN', unknown, DAY, '07:00', db)
    expect((await visitsFor(DAY, db))[0]).toMatchObject({ firstName: '//', company: '//' })
  })

  it('refuses to sign in a car that is already on site', async () => {
    await signIn('DN75WAE', tom, DAY, '07:00', db)
    await expect(signIn('DN75WAE', tom, DAY, '08:00', db)).rejects.toThrow(/already signed in/)
  })

  it('lets a car come back after it has been signed out', async () => {
    const v = await signIn('DN75WAE', tom, DAY, '07:00', db)
    await signOut(v.id, '10:00', db)
    expect(await openVisit('DN75WAE', DAY, db)).toBeUndefined()
    await signIn('DN75WAE', tom, DAY, '11:00', db)
    expect(await visitsFor(DAY, db)).toHaveLength(2)
  })

  it('rejects times that are not 24-hour', async () => {
    await expect(signIn('DN75WAE', tom, DAY, '1:14', db)).rejects.toThrow(/24-hour/)
  })

  it('signs everyone out who is still on site, and nobody else', async () => {
    const a = await signIn('AAA1', tom, DAY, '07:00', db)
    await signIn('BBB2', tom, DAY, '07:00', db)
    await signIn('CCC3', tom, '2026-10-29', '07:00', db)
    await signOut(a.id, '12:00', db)
    expect(await signOutEveryone(DAY, '17:00', db)).toBe(1)
    const rows = await visitsFor(DAY, db)
    expect(rows.map((r) => r.timeOut)).toEqual(['12:00', '17:00'])
    expect((await visitsFor('2026-10-29', db))[0].timeOut).toBe('')
  })

  it('filling in a // driver later updates the master list too', async () => {
    const v = await signIn('LB23YJN', unknown, DAY, '07:00', db)
    await updateVisit(v.id, { firstName: 'Nigel', company: 'Mick' }, db)
    expect(await findCar('LB23YJN', db)).toMatchObject({ firstName: 'Nigel', company: 'Mick' })
  })

  it('suggests master cars as the registration is typed', async () => {
    await signIn('DN75WAE', tom, DAY, '07:00', db)
    await signIn('DN75VAO', tom, DAY, '07:00', db)
    await signIn('MT70SRZ', tom, DAY, '07:00', db)
    expect((await suggestCars('dn75', 6, db)).map((c) => c.reg).sort()).toEqual(['DN75VAO', 'DN75WAE'])
  })

  it('finds a car from the last three characters of its plate', async () => {
    await signIn('DN75WAE', tom, DAY, '07:00', db)
    await signIn('MT70SRZ', tom, DAY, '07:00', db)
    expect((await suggestCars('wae', 6, db)).map((c) => c.reg)).toEqual(['DN75WAE'])
    expect((await suggestCars('70s', 6, db)).map((c) => c.reg)).toEqual(['MT70SRZ'])
  })

  it('puts plates that end with what was typed first', () => {
    const cars = ['AKE123', 'BAKE1', 'XYZAKE', 'AAKE', 'NOPE'].map((reg) => ({ reg }))
    expect(rankByReg(cars, 'ake').map((c) => c.reg)).toEqual(['AAKE', 'XYZAKE', 'AKE123', 'BAKE1'])
    expect(rankByReg(cars, '')).toEqual([])
  })

  it('lists days newest first with counts', async () => {
    await signIn('AAA1', tom, '2026-10-27', '07:00', db)
    await signIn('AAA1', tom, DAY, '07:00', db)
    await signIn('BBB2', tom, DAY, '07:00', db)
    expect(await daysWithVisits(db)).toEqual([{ day: DAY, count: 2 }, { day: '2026-10-27', count: 1 }])
  })

  it('fills in a last name in the master list and on that day\'s sheet', async () => {
    await signIn('DN75WAE', tom, DAY, '07:00', db)
    await signIn('MT70SRZ', tom, DAY, '07:00', db)
    await signIn('DN75WAE', tom, '2026-10-27', '07:00', db)
    await setDriverName('dn75wae', 'Tom', ' Ankrett ', DAY, db)
    expect(await findCar('DN75WAE', db)).toMatchObject({ firstName: 'Tom', lastName: 'Ankrett', company: 'Spencer' })
    const today = await visitsFor(DAY, db)
    expect(today.find((v) => v.reg === 'DN75WAE')!.lastName).toBe('Ankrett')
    expect(today.find((v) => v.reg === 'MT70SRZ')!.lastName).toBe('')
    // an earlier day's printed sheet is left as it was
    expect((await visitsFor('2026-10-27', db))[0].lastName).toBe('')
  })

  it('needs a last name to save', async () => {
    await expect(setDriverName('DN75WAE', 'Tom', '  ', DAY, db)).rejects.toThrow(/last name/)
  })

  it('signs out everyone left on past days at 17:00, and leaves today alone', async () => {
    await signIn('AAA1', tom, '2026-10-27', '07:00', db)
    const out = await signIn('BBB2', tom, '2026-10-27', '07:00', db)
    await signOut(out.id, '15:35', db)
    await signIn('LATE1', tom, '2026-10-27', '18:10', db)
    await signIn('CCC3', tom, DAY, '07:00', db) // today
    expect(await closePastDays(DAY, db)).toBe(2)
    const past = await visitsFor('2026-10-27', db)
    expect(past.map((v) => `${v.reg} ${v.timeOut}`)).toEqual(['AAA1 17:00', 'BBB2 15:35', 'LATE1 18:10'])
    expect((await visitsFor(DAY, db))[0].timeOut).toBe('')
    expect(await closePastDays(DAY, db)).toBe(0)
  })

  it('deletes whole days and nothing else', async () => {
    await signIn('AAA1', tom, '2026-09-22', '07:00', db)
    await signIn('BBB2', tom, '2026-09-22', '07:00', db)
    await signIn('AAA1', tom, '2026-09-24', '07:00', db)
    await signIn('AAA1', tom, DAY, '07:00', db)
    expect(await deleteDays(['2026-09-22', '2026-09-24'], db)).toBe(3)
    expect((await daysWithVisits(db)).map((d) => d.day)).toEqual([DAY])
    expect(await db.cars.count()).toBe(2)
  })

  it('Fridays end at 15:30: the right time for leftovers, and old automatic 17:00s are corrected', async () => {
    expect(endOfDayFor('2026-10-30')).toBe('15:30') // Friday
    expect(endOfDayFor('2026-10-29')).toBe('17:00') // Thursday
    const FRI = '2026-10-30'
    await signIn('AAA1', tom, FRI, '07:00', db)
    const typed = await signIn('BBB2', tom, FRI, '07:00', db)
    await signOut(typed.id, '16:10', db) // a person typed this: never changed
    await signIn('LATE1', tom, FRI, '15:45', db)
    await signIn('THU1', tom, '2026-10-29', '07:00', db)
    // A Friday closed earlier at 17:00 by the app, before this rule existed:
    const old = await signIn('OLD1', tom, FRI, '07:10', db)
    await db.visits.update(old.id, { timeOut: '17:00', autoOut: true })

    await closePastDays('2026-11-03', db)
    const fri = Object.fromEntries((await visitsFor(FRI, db)).map((v) => [v.reg, v.timeOut]))
    expect(fri).toEqual({ AAA1: '15:30', BBB2: '16:10', LATE1: '15:45', OLD1: '15:30' })
    expect((await visitsFor('2026-10-29', db))[0].timeOut).toBe('17:00')
    expect(await closePastDays('2026-11-03', db)).toBe(0)
  })
})
