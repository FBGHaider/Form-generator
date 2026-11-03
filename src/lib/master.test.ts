import { describe, expect, it } from 'vitest'
import { RecordsDb } from './db'
import { importCars, looksLikeReg, masterRows, mergeSheets, parseMasterRows } from './master'

describe('master list import', () => {
  it('reads the columns described for the master sheet', () => {
    const rows = [
      ['Registration', 'First name', 'Last name', 'Company', 'Company to see', 'Time in', 'Time out'],
      ['dn75 wae', 'Tom', '', 'Spencer', 'Spencer', '7:00', '17:00'],
      ['LB23YJN', '//', '', '//', 'Spencer', null, null],
      [null, null, null, null, null, null, null],
    ]
    const r = parseMasterRows(rows)
    expect(r.cars).toEqual([
      { reg: 'DN75WAE', firstName: 'Tom', lastName: '', company: 'Spencer', toSee: 'Spencer' },
      { reg: 'LB23YJN', firstName: '', lastName: '', company: '', toSee: 'Spencer' },
    ])
    expect(r.skipped).toBe(0)
    expect(r.columns.toSee).toBe('Company to see')
  })

  it('finds the heading row below a title', () => {
    const rows = [['Master list'], [], ['Reg', 'Name', 'Company'], ['GK23XHX', 'Lewis Grey', 'Spencer']]
    expect(parseMasterRows(rows).cars[0]).toMatchObject({ firstName: 'Lewis', lastName: 'Grey' })
  })

  it('reports rows with no registration and duplicates', () => {
    const rows = [['Registration', 'First name'], ['', 'Ghost'], ['AA11AAA', 'One'], ['aa11 aaa', 'Two']]
    const r = parseMasterRows(rows)
    expect(r.skipped).toBe(1)
    expect(r.duplicates).toEqual(['AA11AAA'])
    expect(r.cars).toEqual([{ reg: 'AA11AAA', firstName: 'Two', lastName: '', company: '', toSee: '' }])
  })

  it('reads a daily sheet: title rows, the total row is not a car', () => {
    const rows = [
      ['Date: 03 November 2026', null, null, null, null, null, null],
      ['Bannold Drove Crossing - Vehicle Records', null, null, null, null, null, null],
      ['First Name', 'Last name', 'Company', 'To see', 'Time in', 'Time out', 'Registration'],
      ['Tom', 'Ankrett', 'Spencer', 'Spencer', new Date(0), null, 'DN75WAE'],
      ['Paul', null, 'Ace plant', 'Spencer', null, null, 'P25 ACE'],
      ['Total people on site today', null, null, null, null, null, 37],
    ]
    const r = parseMasterRows(rows)
    expect(r.cars.map((c) => c.reg)).toEqual(['DN75WAE', 'P25ACE'])
    expect(r.skipped).toBe(0)
  })

  it('only accepts things shaped like registrations', () => {
    for (const ok of ['DN75WAE', 'M9UTV', 'WI8JRG', 'P25ACE', 'K23ADH', 'GIJPN']) expect(looksLikeReg(ok)).toBe(true)
    for (const bad of ['37', '', 'ABCDEFGH12']) expect(looksLikeReg(bad)).toBe(false)
  })

  it('combines daily sheets, newest filled-in detail wins', () => {
    const oct = parseMasterRows([
      ['Name', 'Company', 'To see', 'Registration'],
      ['Tom brown', 'Spencer', 'Spencer', 'FN24OET'],
      ['Thomas', 'GCP', 'Spencer', 'K23ADH'],
      ['Old', 'Gone', 'Spencer', 'OLD11AA'],
    ]).cars
    const nov2 = parseMasterRows([
      ['First Name', 'Last name', 'Company', 'To see', 'Registration'],
      ['Tom', 'Brown', 'Spencer', 'Spencer', 'FN24OET'],
      ['Thomas', 'Fitzpatrick', 'GCP', 'Spencer', 'K23ADH'],
    ]).cars
    const nov3 = parseMasterRows([
      ['First Name', 'Last name', 'Company', 'To see', 'Registration'],
      ['Thomas', null, 'GCP', 'Spencer', 'K23ADH'],
    ]).cars
    const merged = mergeSheets([oct, nov2, nov3])
    expect(merged.map((c) => c.reg)).toEqual(['FN24OET', 'K23ADH', 'OLD11AA'])
    expect(merged.find((c) => c.reg === 'FN24OET')).toMatchObject({ firstName: 'Tom', lastName: 'Brown' })
    // Blank last name on 3 Nov does not wipe out "Fitzpatrick" from 2 Nov.
    expect(merged.find((c) => c.reg === 'K23ADH')).toMatchObject({ firstName: 'Thomas', lastName: 'Fitzpatrick' })
  })

  it('explains when there is no registration column', () => {
    expect(() => parseMasterRows([['Name', 'Company']])).toThrow(/Registration/)
  })

  it('import updates known cars and keeps cars added on the phone', async () => {
    const db = new RecordsDb(`test-${Math.random()}`)
    await db.cars.put({ reg: 'NEW1', firstName: 'Phone', lastName: '', company: '', toSee: '', updatedAt: 1 })
    await db.cars.put({ reg: 'OLD1', firstName: 'Old', lastName: '', company: '', toSee: '', updatedAt: 1 })
    const res = await importCars([
      { reg: 'OLD1', firstName: 'Updated', lastName: '', company: '', toSee: '' },
      { reg: 'FILE1', firstName: 'File', lastName: '', company: '', toSee: '' },
    ], db)
    expect(res).toEqual({ added: 1, updated: 1 })
    expect((await db.cars.toArray()).map((c) => c.reg).sort()).toEqual(['FILE1', 'NEW1', 'OLD1'])
    expect((await db.cars.get('OLD1'))!.firstName).toBe('Updated')
  })

  it('exports the master list with a heading row', () => {
    const rows = masterRows([{ reg: 'B1', firstName: 'b', lastName: '', company: '', toSee: '' }, { reg: 'A1', firstName: 'a', lastName: '', company: '', toSee: '' }])
    expect(rows[0]).toEqual(['Registration', 'First name', 'Last name', 'Company', 'To see'])
    expect(rows.slice(1).map((r) => r[0])).toEqual(['A1', 'B1'])
  })
})
