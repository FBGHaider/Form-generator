import { beforeEach, describe, expect, it } from 'vitest'
import { RecordsDb } from './db'
import { cellTime, findDay, importDaySheet, parseDaySheet, parsePastedRows } from './daySheet'
import { signIn, visitsFor } from './records'

const DAY = '2026-11-03'
const excelTime = (h: number, m: number) => new Date(Date.UTC(1899, 11, 30, h, m))

// The layout of the daily sheet, with made-up people.
const sheet = [
  ['Date: 03 November 2026', null, null, null, null, null, null],
  ['Bannold Drove Crossing - Vehicle Records', null, null, null, null, null, null],
  ['First Name', 'Last name', 'Company', 'To see', 'Time in', 'Time out', 'Registration'],
  ['Ann', 'Able', 'Spencer', 'Spencer', null, null, 'AA11AAA'],
  ['Bob', 'Baker', 'Mick', 'Spencer', excelTime(7, 0), null, 'BB22BBB'],
  ['//', '', '//', 'Spencer', excelTime(7, 0), null, 'CC33CCC'],
  ['Dee', '', 'Dpd', 'Spencer', excelTime(8, 48), excelTime(8, 52), 'DD44DDD'],
  ['Eve', 'Early', 'GCP', '', excelTime(6, 45), null, 'ee55 eee'],
  [null, null, null, null, null, null, null],
  ['Total people on site today', null, null, null, null, null, 4],
]

let db: RecordsDb
beforeEach(async () => {
  db = new RecordsDb(`test-${Math.random()}`)
  await db.open()
})

describe('reading a day sheet', () => {
  it('reads Excel times, typed times and nothing else', () => {
    expect(cellTime(excelTime(7, 0))).toBe('07:00')
    expect(cellTime(excelTime(13, 5))).toBe('13:05')
    expect(cellTime(0.5)).toBe('12:00')
    expect(cellTime('7:00')).toBe('07:00')
    expect(cellTime('16.30')).toBe('16:30')
    expect(cellTime('')).toBe('')
    expect(cellTime('Spencer')).toBe('')
    expect(cellTime('25:00')).toBe('')
  })

  it('finds the date line', () => {
    expect(findDay('Date: 03 November 2026')).toBe('2026-11-03')
    expect(findDay('28 Oct 2026')).toBe('2026-10-28')
    expect(findDay('Bannold Drove Crossing')).toBeNull()
  })

  it('reads every vehicle row and the date, and skips the total row', () => {
    const s = parseDaySheet(sheet)
    expect(s.day).toBe(DAY)
    expect(s.entries.map((e) => e.reg)).toEqual(['AA11AAA', 'BB22BBB', 'CC33CCC', 'DD44DDD', 'EE55EEE'])
    expect(s.entries[3]).toMatchObject({ firstName: 'Dee', timeIn: '08:48', timeOut: '08:52' })
    expect(s.entries[2]).toMatchObject({ firstName: '', company: '', timeIn: '07:00' })
  })

  it('reads rows pasted from Excel', () => {
    const pasted = [
      'Date: 03 November 2026\t\t\t\t\t\t',
      'First Name\tLast name\tCompany\tTo see\tTime in\tTime out\tRegistration',
      'Bob\tBaker\tMick\tSpencer\t7:00\t\tBB22BBB',
      'Ann\tAble\tSpencer\tSpencer\t\t\tAA11AAA',
    ].join('\r\n')
    const s = parseDaySheet(parsePastedRows(pasted))
    expect(s.day).toBe(DAY)
    expect(s.entries).toHaveLength(2)
    expect(s.entries[0]).toMatchObject({ reg: 'BB22BBB', timeIn: '07:00', timeOut: '' })
  })

  it('explains when there is no Time in column', () => {
    expect(() => parseDaySheet([['Registration', 'Name']])).toThrow(/Time in/)
  })
})

describe('importing a day sheet', () => {
  it('signs in rows with a time in, in time order, and signs out those with a time out', async () => {
    const r = await importDaySheet(DAY, parseDaySheet(sheet).entries, db)
    expect(r).toMatchObject({ added: 4, noTimeIn: 1, alreadyIn: 0, signedOut: 0 })
    const rows = await visitsFor(DAY, db)
    expect(rows.map((v) => `${v.reg} ${v.timeIn}-${v.timeOut}`)).toEqual([
      'EE55EEE 06:45-', 'BB22BBB 07:00-', 'CC33CCC 07:00-', 'DD44DDD 08:48-08:52',
    ])
  })

  it('adds cars missing from the master list, including rows with no time in', async () => {
    const r = await importDaySheet(DAY, parseDaySheet(sheet).entries, db)
    expect(r.newCars.sort()).toEqual(['AA11AAA', 'BB22BBB', 'CC33CCC', 'DD44DDD', 'EE55EEE'])
    expect(await db.cars.get('AA11AAA')).toMatchObject({ firstName: 'Ann', lastName: 'Able' })
  })

  it('keeps the master list details and only fills in what it is missing', async () => {
    await db.cars.put({ reg: 'BB22BBB', firstName: 'Robert', lastName: 'Baker', company: 'Mick George', toSee: 'Spencer', updatedAt: 1 })
    await db.cars.put({ reg: 'CC33CCC', firstName: '', lastName: '', company: 'Spencer', toSee: '', updatedAt: 1 })
    await importDaySheet(DAY, parseDaySheet(sheet).entries, db)
    const rows = await visitsFor(DAY, db)
    expect(rows.find((v) => v.reg === 'BB22BBB')).toMatchObject({ firstName: 'Robert', company: 'Mick George' })
    expect(rows.find((v) => v.reg === 'CC33CCC')).toMatchObject({ company: 'Spencer', toSee: 'Spencer' })
    expect(await db.cars.get('BB22BBB')).toMatchObject({ firstName: 'Robert' })
  })

  it('can be imported again later: nothing doubles, new time outs are filled in', async () => {
    await importDaySheet(DAY, parseDaySheet(sheet).entries, db)
    const later = sheet.map((r) => [...r])
    later[4][5] = excelTime(16, 30) // Bob has left
    later.splice(8, 0, ['Fay', '', 'GCP', 'Spencer', excelTime(9, 11), null, 'FF66FFF']) // a new arrival
    const r = await importDaySheet(DAY, parseDaySheet(later).entries, db)
    expect(r).toMatchObject({ added: 1, signedOut: 1, alreadyIn: 3 })
    const rows = await visitsFor(DAY, db)
    expect(rows).toHaveLength(5)
    expect(rows.find((v) => v.reg === 'BB22BBB')!.timeOut).toBe('16:30')
  })

  it('leaves a car alone that was already signed in on the phone at another time', async () => {
    await signIn('BB22BBB', { firstName: 'Bob', lastName: '', company: '', toSee: '' }, DAY, '07:05', db)
    const r = await importDaySheet(DAY, parseDaySheet(sheet).entries, db)
    expect(r.onSiteAlready).toEqual(['BB22BBB'])
    expect((await visitsFor(DAY, db)).filter((v) => v.reg === 'BB22BBB')).toHaveLength(1)
  })
})
