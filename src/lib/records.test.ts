import { beforeEach, describe, expect, it } from 'vitest'
import { RecordsDb } from './db'
import {
  daysWithVisits, findCar, openVisit, signIn, signOut, signOutEveryone, suggestCars, updateVisit, visitsFor,
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

  it('lists days newest first with counts', async () => {
    await signIn('AAA1', tom, '2026-10-27', '07:00', db)
    await signIn('AAA1', tom, DAY, '07:00', db)
    await signIn('BBB2', tom, DAY, '07:00', db)
    expect(await daysWithVisits(db)).toEqual([{ day: DAY, count: 2 }, { day: '2026-10-27', count: 1 }])
  })
})
