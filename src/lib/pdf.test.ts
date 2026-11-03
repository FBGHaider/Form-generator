import { describe, expect, it } from 'vitest'
import type { Visit } from './db'
import { buildDayPdf, pdfFileName, sheetRows } from './pdf'

const v = (over: Partial<Visit>): Visit => ({
  id: 1, day: '2026-10-28', reg: 'DN75WAE', firstName: 'Tom', lastName: '', company: 'Spencer',
  toSee: 'Spencer', timeIn: '07:00', timeOut: '17:00', createdAt: 1, ...over,
})

describe('daily PDF', () => {
  it('prints rows in the sheet column order', () => {
    expect(sheetRows([v({})])).toEqual([['Tom', 'Spencer', 'Spencer', '7:00', '17:00', 'DN75WAE']])
  })

  it('prints // for unknown drivers and leaves time out blank while on site', () => {
    expect(sheetRows([v({ firstName: '//', company: '', timeOut: '' })])).toEqual([
      ['//', '//', 'Spencer', '7:00', '', 'DN75WAE'],
    ])
  })

  it('names the file after the day', () => {
    expect(pdfFileName('2026-10-28')).toBe('28_Oct_2026.pdf')
  })

  it('builds an A4 sheet with the title and the total', () => {
    const doc = buildDayPdf('2026-10-28', [v({}), v({ id: 2, reg: 'MT70SRZ' })])
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(595.28, 1)
    const raw = doc.output()
    expect(raw).toContain('Bannold Drove Crossing - Vehicle Records')
    expect(raw).toContain('Date: 28 Oct 2026')
    expect(raw).toContain('Total people on site today')
    expect(raw).toContain('MT70SRZ')
  })

  it('runs onto a second page on a busy day', () => {
    const many = Array.from({ length: 70 }, (_, i) => v({ id: i, reg: `REG${i}` }))
    expect(buildDayPdf('2026-10-28', many).getNumberOfPages()).toBe(2)
  })
})
