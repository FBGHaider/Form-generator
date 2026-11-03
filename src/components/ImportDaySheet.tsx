import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db } from '../lib/db'
import { findDay, importDaySheet, parseDaySheet, parsePastedRows, type DaySheet } from '../lib/daySheet'
import { displayName, longDay, printTime } from '../lib/format'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

type Book = { sheet: string; data: unknown[][] }[]

/** The sheet for `day` in a workbook of daily sheets, or else the last one. */
function pickSheet(book: Book, day: string): number {
  const i = book.findIndex((s) => findDay(s.sheet) === day || findDay(String(s.data[0]?.[0] ?? '')) === day)
  return i === -1 ? book.length - 1 : i
}

/**
 * Bring a day's sheet kept in Excel into the app: from the .xlsx file, or
 * from rows copied in Excel and pasted here.
 */
export function ImportDaySheet({ today, onClose }: { today: string; onClose: () => void }) {
  const notify = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [pasted, setPasted] = useState('')
  const [parsed, setParsed] = useState<DaySheet | null>(null)
  const [busy, setBusy] = useState(false)

  const read = (rows: unknown[][]) => {
    try {
      setParsed(parseDaySheet(rows))
    } catch (e) {
      setParsed(null)
      notify(errorText(e), 'error')
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const { readWorkbook } = await import('../lib/excel')
      const b = await readWorkbook(f)
      if (b.length === 0) throw new Error('The file has no sheets.')
      const i = pickSheet(b, today)
      setBook(b)
      setSheetIndex(i)
      read(b[i].data)
    } catch (err) {
      notify(`Could not read that file: ${errorText(err)}`, 'error')
    }
  }

  const day = parsed?.day ?? (book ? findDay(book[sheetIndex].sheet) : null) ?? today
  const timed = parsed?.entries.filter((e) => e.timeIn) ?? []
  const out = timed.filter((e) => e.timeOut).length
  // Show the name that will be saved: the master list's, where it has one.
  const known = useLiveQuery(
    async () => new Map((await db.cars.bulkGet(timed.map((e) => e.reg))).filter((c) => !!c).map((c) => [c!.reg, c!])),
    [timed.map((e) => e.reg).join()],
  )
  const nameOf = (e: (typeof timed)[number]) => {
    const c = known?.get(e.reg)
    return displayName(c?.firstName || e.firstName, c?.firstName ? c.lastName : e.lastName)
  }

  const go = async () => {
    if (!parsed) return
    setBusy(true)
    try {
      const r = await importDaySheet(day, parsed.entries)
      const parts = [`${r.added} signed in`]
      if (r.signedOut) parts.push(`${r.signedOut} signed out`)
      if (r.alreadyIn) parts.push(`${r.alreadyIn} already there`)
      if (r.onSiteAlready.length) parts.push(`${r.onSiteAlready.length} already signed in on the phone`)
      if (r.newCars.length) parts.push(`${r.newCars.length} new to master list`)
      notify(parts.join(' · '))
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
      setBusy(false)
    }
  }

  return (
    <Sheet title="Import sheet" onClose={onClose}>
      {!parsed && (
        <>
          <p className="hint">
            Bring in a day you kept in Excel. Rows with a time in are signed in at that time; rows without one are
            left off. You can import again later — nothing is added twice.
          </p>
          <button type="button" className="btn primary block" onClick={() => file.current?.click()}>Choose Excel file</button>
          <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />
          <div className="or">or</div>
          <label className="field">
            <span>Paste rows copied from Excel (include the heading row)</span>
            <textarea className="paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6}
              placeholder={'First Name\tLast name\tCompany\tTo see\tTime in\tTime out\tRegistration\n…'} />
          </label>
          <button type="button" className="btn block" disabled={!pasted.trim()} onClick={() => read(parsePastedRows(pasted))}>
            Read pasted rows
          </button>
        </>
      )}

      {parsed && (
        <>
          {book && book.length > 1 && (
            <label className="field">
              <span>Sheet</span>
              <select value={sheetIndex} onChange={(e) => { const i = Number(e.target.value); setSheetIndex(i); read(book[i].data) }}>
                {book.map((s, i) => <option key={s.sheet + i} value={i}>{s.sheet}</option>)}
              </select>
            </label>
          )}
          <p>
            <strong>{timed.length}</strong> signed in{out > 0 && <>, {out} of them already out</>}, for{' '}
            <strong>{longDay(day)}</strong>.
            {parsed.entries.length > timed.length && (
              <span className="muted"> {parsed.entries.length - timed.length} rows have no time in and are left off.</span>
            )}
          </p>
          {day !== today && (
            <div className="notice warn">This sheet is for {longDay(day)}, not today. It will go under Past days.</div>
          )}
          <ul className="list compact">
            {timed.map((e) => (
              <li key={e.reg + e.timeIn} className="day-row">
                <span><span className="plate">{e.reg}</span> {nameOf(e)}</span>
                <span className="visit-time">{printTime(e.timeIn)}{e.timeOut && <> – {printTime(e.timeOut)}</>}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary block" disabled={busy || timed.length === 0} onClick={go}>
            Add {timed.length} to {day === today ? 'today' : longDay(day)}
          </button>
          <button type="button" className="btn block" onClick={() => { setParsed(null); setBook(null) }}>Choose something else</button>
        </>
      )}
    </Sheet>
  )
}
