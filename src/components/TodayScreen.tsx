import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Visit } from '../lib/db'
import { displayName, longDay, orUnknown, printTime } from '../lib/format'
import { visitsFor } from '../lib/records'
import { lastSentDay, sendEndOfDay } from '../lib/endOfDay'
import { shareFile } from '../lib/share'
import { errorText, useToast } from './Toast'

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

export function TodayScreen({ day, onOpen, onSignIn, onSignOut, onEveryoneOut, onImport }: {
  day: string
  onOpen: (v: Visit) => void
  onSignIn: () => void
  onSignOut: () => void
  onEveryoneOut: (count: number) => void
  onImport: () => void
}) {
  const notify = useToast()
  const [showOut, setShowOut] = useState(false)
  const visits = useLiveQuery(() => db.visits.where('day').equals(day).sortBy('createdAt'), [day]) ?? []

  const onSite = visits.filter((v) => v.timeOut === '')
  const out = visits.filter((v) => v.timeOut !== '')

  // After 4pm, remind until today's list has been sent.
  const [sentDay, setSentDay] = useState(lastSentDay())
  const remind = visits.length > 0 && sentDay !== day && new Date().getHours() >= 16

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
          <h1>Today</h1>
          <div className="muted">{longDay(day)} · {visits.length} on the sheet</div>
        </div>
      </header>

      <div className="in-out">
        <button type="button" className="btn primary" onClick={onSignIn}>+ Sign in</button>
        <button type="button" className="btn out" onClick={onSignOut} disabled={onSite.length === 0}>Sign out</button>
      </div>

      <div className="button-row">
        <button type="button" className="btn" onClick={onImport}>Import sheet</button>
        <button type="button" className="btn" onClick={exportPdf} disabled={visits.length === 0}>Export PDF</button>
        <button type="button" className="btn" onClick={sendToday} disabled={visits.length === 0}>Send end of day</button>
      </div>

      {remind && (
        <div className="notice warn end-of-day">
          <span>End of the day: email yourself today's list and the backup.</span>
          <button type="button" className="btn primary" onClick={sendToday}>Send now</button>
        </div>
      )}

      <section>
        <div className="section-head">
          <h2>On site now ({onSite.length})</h2>
          {onSite.length > 0 && (
            <button type="button" className="link" onClick={() => onEveryoneOut(onSite.length)}>Everyone out</button>
          )}
        </div>
        {onSite.length === 0 ? (
          <p className="empty">Nobody on site. Tap + Sign in to sign a vehicle in.</p>
        ) : (
          <ul className="list">{onSite.map((v) => <Row key={v.id} v={v} onOpen={onOpen} />)}</ul>
        )}
      </section>

      {out.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Signed out ({out.length})</h2>
            <button type="button" className="link" onClick={() => setShowOut(!showOut)}>{showOut ? 'Hide' : 'Show'}</button>
          </div>
          {showOut && <ul className="list">{out.map((v) => <Row key={v.id} v={v} onOpen={onOpen} />)}</ul>}
        </section>
      )}
    </main>
  )
}
