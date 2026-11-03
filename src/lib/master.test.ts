import { describe, expect, it } from 'vitest'
import { RecordsDb } from './db'
import { importCars, masterRows, parseMasterRows } from './master'

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
      { reg: 'LB23YJN', firstName: '//', lastName: '', company: '//', toSee: 'Spencer' },
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
