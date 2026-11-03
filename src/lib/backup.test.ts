import { beforeEach, describe, expect, it } from 'vitest'
import { masterRows, parseBackup, restoreBackup, signInRows } from './backup'
import { RecordsDb } from './db'
import { signIn, signOut, visitsFor } from './records'

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
})
