import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type Visit } from '../lib/db'
import { displayName, longDay, normaliseReg, orUnknown, printTime, shiftDay, weekdayDay } from '../lib/format'
import { visitsFor } from '../lib/records'
import { lastSentDay, sendEndOfDay } from '../lib/endOfDay'
import { shareFile } from '../lib/share'
import { errorText, useToast } from './Toast'

/** A plate matches on any part ("WAE"); a name or company on any part of it. */
function matches(v: Visit, q: string) {
  const reg = normaliseReg(q)
  if (reg && v.reg.includes(reg)) return true
  return `${v.firstName} ${v.lastName} ${v.company}`.toLowerCase().includes(q.trim().toLowerCase())
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

/**
 * One day's sheet — today's, or any earlier day picked with the arrows or the
 * date box. Every feature works the same on any day; the end-of-day send is
 * for today only.
 */
export function TodayScreen({ day, today, onDay, onOpen, onSignIn, onSignOut, onEveryoneOut, onImport, clearSearch }: {
  day: string
  /** Changes whenever the search box should be emptied (after a car was changed). */
  clearSearch: number
  today: string
  onDay: (day: string) => void
  onOpen: (v: Visit) => void
  onSignIn: () => void
  onSignOut: () => void
  onEveryoneOut: (count: number) => void
  onImport: () => void
}) {
  const notify = useToast()
  const [showOut, setShowOut] = useState(false)
  const visits = useLiveQuery(() => db.visits.where('day').equals(day).sortBy('createdAt'), [day]) ?? []

  // Search this day's list by plate or name; empties after a car is changed,
  // or when moving to another day.
  const [q, setQ] = useState('')
  useEffect(() => setQ(''), [clearSearch, day])
  const searching = q.trim() !== ''
  const shown = searching ? visits.filter((v) => matches(v, q)) : visits

  const onSite = shown.filter((v) => v.timeOut === '')
  const out = shown.filter((v) => v.timeOut !== '')
  const allOnSite = visits.filter((v) => v.timeOut === '').length

  // After 4pm, remind until today's list has been sent.
  const [sentDay, setSentDay] = useState(lastSentDay())
  const isToday = day === today
  const remind = isToday && visits.length > 0 && sentDay !== day && new Date().getHours() >= 16

  const sendToday = async () => {
    try {
      const outcome = await sendEndOfDay(day)
      setSentDay(lastSentDay())
      if (outcome === 'downloaded') notify('Saved the PDF and the backup file')
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

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
          <h1>{isToday ? 'Today' : weekdayDay(day)}</h1>
          <div className="muted">{isToday ? `${longDay(day)} · ` : ''}{visits.length} on the sheet</div>
        </div>
      </header>

      <div className="day-nav">
        <button type="button" className="btn" aria-label="Day before" onClick={() => onDay(shiftDay(day, -1))}>‹</button>
        <input type="date" value={day} max={today} aria-label="Pick a day"
          onChange={(e) => e.target.value && onDay(e.target.value > today ? today : e.target.value)} />
        <button type="button" className="btn" aria-label="Day after" disabled={isToday} onClick={() => onDay(shiftDay(day, 1))}>›</button>
      </div>
      {!isToday && (
        <div className="notice warn past-day">
          <span>You are looking at <strong>{longDay(day)}</strong>, not today. Changes are saved to that day.</span>
          <button type="button" className="btn primary" onClick={() => onDay(today)}>Back to today</button>
        </div>
      )}

      <div className="in-out">
        <button type="button" className="btn primary" onClick={onSignIn}>+ Sign in</button>
        <button type="button" className="btn out" onClick={onSignOut} disabled={allOnSite === 0}>Sign out</button>
      </div>

      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search car or name to change it"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="button-row">
        <button type="button" className="btn" onClick={onImport}>Import sheet</button>
        <button type="button" className="btn" onClick={exportPdf} disabled={visits.length === 0}>Export PDF</button>
        {isToday && <button type="button" className="btn" onClick={sendToday} disabled={visits.length === 0}>Send end of day</button>}
      </div>

      {remind && (
        <div className="notice warn end-of-day">
          <span>End of the day: email yourself today's list and the backup.</span>
          <button type="button" className="btn primary" onClick={sendToday}>Send now</button>
        </div>
      )}

      {searching && shown.length === 0 && <p className="empty">No car on this day matches “{q.trim()}”.</p>}

      {(isToday || onSite.length > 0) && !(searching && onSite.length === 0) && <section>
        <div className="section-head">
          <h2>{isToday ? 'On site now' : 'Still signed in'} ({onSite.length})</h2>
          {onSite.length > 0 && (
            <button type="button" className="link" onClick={() => onEveryoneOut(allOnSite)}>Everyone out</button>
          )}
        </div>
        {onSite.length === 0 ? (
          <p className="empty">{isToday ? 'Nobody on site. Tap + Sign in to sign a vehicle in.' : 'Nobody left signed in on this day.'}</p>
        ) : (
          <ul className="list">{onSite.map((v) => <Row key={v.id} v={v} onOpen={onOpen} />)}</ul>
        )}
      </section>}

      {out.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Signed out ({out.length})</h2>
            {isToday && !searching && <button type="button" className="link" onClick={() => setShowOut(!showOut)}>{showOut ? 'Hide' : 'Show'}</button>}
          </div>
          {(showOut || !isToday || searching) && <ul className="list">{out.map((v) => <Row key={v.id} v={v} onOpen={onOpen} />)}</ul>}
        </section>
      )}
    </main>
  )
}
