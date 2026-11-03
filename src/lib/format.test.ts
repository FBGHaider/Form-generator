import { describe, expect, it } from 'vitest'
import { groupByWeek, shiftDay, weekdayDay, weekLabel, weekStart, dayKey, displayName, fileDay, isValidTime, longDay, normaliseReg, orUnknown, printTime, timeNow } from './format'

describe('format', () => {
  it('normalises registrations', () => {
    expect(normaliseReg(' dn75 wae ')).toBe('DN75WAE')
    expect(normaliseReg('cc21-tow')).toBe('CC21TOW')
  })

  it('prints // for unknown details', () => {
    expect(orUnknown('')).toBe('//')
    expect(orUnknown('  ')).toBe('//')
    expect(orUnknown('//')).toBe('//')
    expect(orUnknown('Mick')).toBe('Mick')
  })

  it('joins first and last name into the Name column', () => {
    expect(displayName('Lewis', 'Grey')).toBe('Lewis Grey')
    expect(displayName('Tom', '')).toBe('Tom')
    expect(displayName('', '')).toBe('//')
    expect(displayName('//', '')).toBe('//')
    expect(displayName(' Edy ', ' groffin ')).toBe('Edy groffin')
  })

  it('uses a 24-hour clock', () => {
    expect(timeNow(new Date(2026, 9, 28, 13, 14))).toBe('13:14')
    expect(timeNow(new Date(2026, 9, 28, 7, 5))).toBe('07:05')
    expect(isValidTime('13:14')).toBe(true)
    expect(isValidTime('1:14')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
  })

  it('prints times like the paper sheet', () => {
    expect(printTime('07:00')).toBe('7:00')
    expect(printTime('17:00')).toBe('17:00')
    expect(printTime('00:30')).toBe('0:30')
    expect(printTime('')).toBe('')
  })

  it('names days', () => {
    expect(dayKey(new Date(2026, 9, 28, 23, 59))).toBe('2026-10-28')
    expect(longDay('2026-10-28')).toBe('28 Oct 2026')
    expect(fileDay('2026-10-28')).toBe('28_Oct_2026')
  })

  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-03')).toBe('2026-11-02') // Tuesday
    expect(weekStart('2026-11-02')).toBe('2026-11-02') // Monday
    expect(weekStart('2026-11-08')).toBe('2026-11-02') // Sunday
    expect(weekStart('2026-11-01')).toBe('2026-10-26') // Sunday, the week before
  })

  it('moves between days across months', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(weekdayDay('2026-11-03')).toBe('Tuesday 3 Nov 2026')
  })

  it('labels and groups weeks, Monday to Sunday', () => {
    expect(weekLabel('2026-10-26')).toBe('26 Oct – 1 Nov 2026')
    expect(weekLabel('2026-12-28')).toBe('28 Dec 2026 – 3 Jan 2027')
    const days = ['2026-11-03', '2026-11-02', '2026-10-30', '2026-10-26', '2026-10-23'].map((day) => ({ day }))
    expect(groupByWeek(days).map((g) => [g.monday, g.days.map((d) => d.day)])).toEqual([
      ['2026-11-02', ['2026-11-03', '2026-11-02']],
      ['2026-10-26', ['2026-10-30', '2026-10-26']],
      ['2026-10-19', ['2026-10-23']],
    ])
  })
})
