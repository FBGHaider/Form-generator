import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type Visit } from '../lib/db'
import { displayName, longDay, normaliseReg, orUnknown, printTime } from '../lib/format'
import { visitsFor } from '../lib/records'
import { shareFile } from '../lib/share'
import { errorText, useToast } from './Toast'

function matches(v: Visit, q: string) {
  if (!q) return true
  const reg = normaliseReg(q)
  if (reg && v.reg.includes(reg)) return true
  const hay = `${v.firstName} ${v.lastName} ${v.company}`.toLowerCase()
  return hay.includes(q.trim().toLowerCase())
}

function Row({ v, onOpen }: { v: Visit; onOpen: (v: Visit) => void }) {
  return (
    <li>
      <button type="button" className="visit" onClick={() => onOpen(v)}>
        <span className="plate">{v.reg}</span>
        <span className="visit-who">
          <span>{displayName(v.firstName, v.lastName)}</span>
          <span className="muted">{orUnknown(v.company)}</span>
        </span>
        <span className="visit-time">
          {printTime(v.timeIn)}
          {v.timeOut && <> – {printTime(v.timeOut)}</>}
        </span>
      </button>
    </li>
  )
}

export function TodayScreen({ day, onOpen, onEveryoneOut, onImport, clearSearch }: {
  day: string
  onOpen: (v: Visit) => void
  onEveryoneOut: (count: number) => void
  onImport: () => void
  /** Changes whenever the search box should be emptied (after signing a car in or out). */
  clearSearch: number
}) {
  const notify = useToast()
  const [q, setQ] = useState('')
  useEffect(() => setQ(''), [clearSearch])
  const [showOut, setShowOut] = useState(false)
  const visits = useLiveQuery(() => db.visits.where('day').equals(day).sortBy('createdAt'), [day]) ?? []

  const onSite = visits.filter((v) => v.timeOut === '')
  const out = visits.filter((v) => v.timeOut !== '')
  const shownOn = onSite.filter((v) => matches(v, q))
  const shownOut = out.filter((v) => matches(v, q))

  const exportPdf = async () => {
    try {
      const { dayPdfBlob, pdfFileName } = await import('../lib/pdf')
      await shareFile(dayPdfBlob(day, await visitsFor(day)), pdfFileName(day))
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <h1>Today</h1>
          <div className="muted">{longDay(day)} · {visits.length} on the sheet</div>
        </div>
      </header>

      <div className="button-row">
        <button type="button" className="btn" onClick={onImport}>Import sheet</button>
        <button type="button" className="btn" onClick={exportPdf} disabled={visits.length === 0}>Export PDF</button>
      </div>

      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search registration or name"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <section>
        <div className="section-head">
          <h2>On site now ({onSite.length})</h2>
          {onSite.length > 0 && (
            <button type="button" className="link" onClick={() => onEveryoneOut(onSite.length)}>Everyone out</button>
          )}
        </div>
        {shownOn.length === 0 ? (
          <p className="empty">{onSite.length === 0 ? 'Nobody signed in yet. Tap + to sign a vehicle in.' : 'No match.'}</p>
        ) : (
          <ul className="list">{shownOn.map((v) => <Row key={v.id} v={v} onOpen={onOpen} />)}</ul>
        )}
      </section>

      {out.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Signed out ({out.length})</h2>
            <button type="button" className="link" onClick={() => setShowOut(!showOut)}>{showOut ? 'Hide' : 'Show'}</button>
          </div>
          {(showOut || q) && <ul className="list">{shownOut.map((v) => <Row key={v.id} v={v} onOpen={onOpen} />)}</ul>}
        </section>
      )}
    </main>
  )
}
