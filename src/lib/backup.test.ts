import { beforeEach, describe, expect, it } from 'vitest'
import { masterRows, parseBackup, restoreBackup, signInRows } from './backup'
import { RecordsDb } from './db'
import { closePastDays, signIn, signOut, visitsFor } from './records'

let db: RecordsDb
beforeEach(async () => {
  db = new RecordsDb(`test-${Math.random()}`)
  await db.open()
})

const tom = { firstName: 'Tom', lastName: 'Ankrett', company: 'Spencer', toSee: 'Spencer' }
const jess = { firstName: 'Jess', lastName: '', company: 'Spencer', toSee: 'Spencer' }

/** What the backup file holds, as the sheet reader hands it back. */
async function backupOf(source: RecordsDb) {
  return [
    { sheet: 'Master', data: masterRows(await source.cars.toArray()) as unknown[][] },
    { sheet: 'Sign-ins', data: signInRows(await source.visits.toArray()) as unknown[][] },
  ]
}

describe('backup and restore', () => {
  it('writes every day, in date then sign-in order', async () => {
    await signIn('DN75WAE', tom, '2026-11-03', '07:00', db)
    await signIn('MJ70DJU', jess, '2026-11-02', '07:10', db)
    const rows = signInRows(await db.visits.toArray())
    expect(rows[0]).toEqual(['Date', 'First name', 'Last name', 'Company', 'To see', 'Time in', 'Time out', 'Registration'])
    expect(rows.slice(1).map((r) => `${r[0]} ${r[7]}`)).toEqual(['2 Nov 2026 MJ70DJU', '3 Nov 2026 DN75WAE'])
  })

  it('restores everything onto an empty phone', async () => {
    const a = await signIn('DN75WAE', tom, '2026-11-03', '07:00', db)
    await signOut(a.id, '17:00', db)
    await signIn('MJ70DJU', jess, '2026-11-02', '07:10', db)
    await db.cars.put({ reg: 'ZZ99ZZZ', firstName: 'Never', lastName: 'Came', company: '', toSee: '', updatedAt: 1 })

    const fresh = new RecordsDb(`test-${Math.random()}`)
    const r = await restoreBackup(parseBackup(await backupOf(db)), fresh)
    expect(r).toEqual({ carsAdded: 3, days: 2, signInsAdded: 2 })
    expect(await fresh.cars.count()).toBe(3)
    expect((await visitsFor('2026-11-03', fresh))[0]).toMatchObject({ reg: 'DN75WAE', lastName: 'Ankrett', timeIn: '07:00', timeOut: '17:00' })
    expect((await visitsFor('2026-11-02', fresh))[0]).toMatchObject({ reg: 'MJ70DJU', timeIn: '07:10', timeOut: '' })
  })

  it('never overwrites or removes what is on the phone, and is safe to repeat', async () => {
    await signIn('DN75WAE', tom, '2026-11-03', '07:00', db)
    const backup = parseBackup(await backupOf(db))

    // Since the backup: a last name was added and another car came in.
    await db.cars.update('DN75WAE', { lastName: 'Newer' })
    await signIn('MJ70DJU', jess, '2026-11-03', '08:00', db)

    const r1 = await restoreBackup(backup, db)
    const r2 = await restoreBackup(backup, db)
    expect(r1.signInsAdded + r2.signInsAdded).toBe(0)
    expect((await db.cars.get('DN75WAE'))!.lastName).toBe('Newer')
    expect(await visitsFor('2026-11-03', db)).toHaveLength(2)
  })

  it('a master-list-only file restores the master list', async () => {
    const r = parseBackup([{ sheet: 'Master', data: [['Registration', 'First name'], ['AB12CDE', 'Ann']] }])
    expect(r.cars).toHaveLength(1)
    expect(r.days.size).toBe(0)
  })

  it('explains when the file is not a backup', () => {
    expect(() => parseBackup([{ sheet: '3 November 2026', data: [['Registration']] }])).toThrow(/not a backup/)
  })

  it('hands a day over to a colleague and back', async () => {
    const DAY = '2026-11-03'
    // Morning, my phone: two on site, one already gone.
    const a = await signIn('AAA1', tom, DAY, '07:00', db)
    await signIn('BBB2', tom, DAY, '07:10', db)
    const c = await signIn('CCC3', tom, DAY, '08:00', db)
    await signOut(c.id, '11:00', db)
    void a

    // 12:00 — the colleague takes over from my file.
    const theirs = new RecordsDb(`test-${Math.random()}`)
    await restoreBackup(parseBackup(await backupOf(db)), theirs)
    const onTheirs = await visitsFor(DAY, theirs)
    expect(onTheirs.map((v) => `${v.reg} ${v.timeIn}-${v.timeOut}`)).toEqual(['AAA1 07:00-', 'BBB2 07:10-', 'CCC3 08:00-11:00'])

    // Afternoon on their phone: AAA1 leaves, a new car comes and goes, BBB2 leaves and comes back.
    await signOut(onTheirs[0].id, '15:30', theirs)
    const d = await signIn('DDD4', jess, DAY, '13:00', theirs)
    await signOut(d.id, '13:40', theirs)
    await signOut(onTheirs[1].id, '12:30', theirs)
    await signIn('BBB2', tom, DAY, '14:00', theirs)

    // Next morning my phone has closed yesterday at 17:00 by itself...
    await closePastDays('2026-11-04', db)
    expect((await visitsFor(DAY, db)).find((v) => v.reg === 'AAA1')!.timeOut).toBe('17:00')
    // ...and then takes their handover: real times win over the automatic 17:00.
    await restoreBackup(parseBackup(await backupOf(theirs)), db)
    await closePastDays('2026-11-04', db)
    const mine = await visitsFor(DAY, db)
    expect(mine.map((v) => `${v.reg} ${v.timeIn}-${v.timeOut}`).sort()).toEqual([
      'AAA1 07:00-15:30', 'BBB2 07:10-12:30', 'BBB2 14:00-17:00', 'CCC3 08:00-11:00', 'DDD4 13:00-13:40',
    ])
  })

  it('a time out typed by a person is never replaced by a handover', async () => {
    const DAY = '2026-11-03'
    const a = await signIn('AAA1', tom, DAY, '07:00', db)
    await signOut(a.id, '16:10', db)
    const other = new RecordsDb(`test-${Math.random()}`)
    await restoreBackup(parseBackup(await backupOf(db)), other)
    await other.visits.toCollection().modify({ timeOut: '17:00' })
    await restoreBackup(parseBackup(await backupOf(other)), db)
    expect((await visitsFor(DAY, db))[0].timeOut).toBe('16:10')
  })
})
