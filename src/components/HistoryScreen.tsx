import { useLiveQuery } from 'dexie-react-hooks'
import { longDay } from '../lib/format'
import { daysWithVisits, visitsFor } from '../lib/records'
import { shareFile } from '../lib/share'
import { errorText, useToast } from './Toast'

export function HistoryScreen() {
  const notify = useToast()
  const days = useLiveQuery(() => daysWithVisits(), []) ?? []

  const exportDay = async (day: string) => {
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
          <h1>Past days</h1>
          <div className="muted">Every day is kept on this phone</div>
        </div>
      </header>
      {days.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ul className="list">
          {days.map(({ day, count }) => (
            <li key={day} className="day-row">
              <span>
                <strong>{longDay(day)}</strong>
                <span className="muted"> · {count} vehicles</span>
              </span>
              <button type="button" className="btn small" onClick={() => exportDay(day)}>PDF</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
