import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import type { BackupContents } from '../lib/backup'
import { dayKey, longDay } from '../lib/format'
import { lastSentDay, sendBackup } from '../lib/endOfDay'
import { daysWithVisits, visitsFor } from '../lib/records'
import { shareFile } from '../lib/share'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

function RestoreSheet({ backup, onClose }: { backup: BackupContents; onClose: () => void }) {
  const notify = useToast()
  const [busy, setBusy] = useState(false)
  const signIns = [...backup.days.values()].reduce((n, d) => n + d.length, 0)
  const go = async () => {
    setBusy(true)
    try {
      const { restoreBackup } = await import('../lib/backup')
      const r = await restoreBackup(backup)
      notify(`Restored: ${r.carsAdded} cars added, ${r.signInsAdded} sign-ins added across ${r.days} days`)
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
      setBusy(false)
    }
  }
  return (
    <Sheet title="Restore from backup" onClose={onClose}>
      <p>This backup has <strong>{backup.cars.length}</strong> cars and <strong>{signIns}</strong> sign-ins over{' '}
        <strong>{backup.days.size}</strong> days.</p>
      <p className="hint">Nothing on this phone is overwritten or removed. Missing cars and days are added, and empty
        details filled in. Restoring the same backup twice is harmless.</p>
      <button type="button" className="btn primary block" disabled={busy} onClick={go}>Restore</button>
    </Sheet>
  )
}

export function HistoryScreen() {
  const notify = useToast()
  const days = useLiveQuery(() => daysWithVisits(), []) ?? []
  const file = useRef<HTMLInputElement>(null)
  const [restoring, setRestoring] = useState<BackupContents | null>(null)
  const [sent, setSent] = useState(lastSentDay())

  const exportDay = async (day: string) => {
    try {
      const { dayPdfBlob, pdfFileName } = await import('../lib/pdf')
      await shareFile(dayPdfBlob(day, await visitsFor(day)), pdfFileName(day))
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  const backUp = async () => {
    try {
      await sendBackup(dayKey())
      setSent(lastSentDay())
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const { readBackupFile } = await import('../lib/excel')
      setRestoring(await readBackupFile(f))
    } catch (err) {
      notify(`Could not read that file: ${errorText(err)}`, 'error')
    }
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <h1>Past days</h1>
          <div className="muted">Every day is kept on this phone</div>
          <div className="muted">App version: {__APP_VERSION__}</div>
        </div>
      </header>

      <section className="backup">
        <h2>Backup</h2>
        <p className="hint">
          Everything lives only on this phone. A backup is one Excel file with your master list and every day —
          email it to yourself or save it to iCloud Drive. Last backup: <strong>{sent ? longDay(sent) : 'never'}</strong>.
        </p>
        <div className="button-row">
          <button type="button" className="btn primary" onClick={backUp}>Back up everything</button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>Restore from backup</button>
          <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />
        </div>
      </section>

      <section>
        <h2>Days</h2>
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
      </section>

      {restoring && <RestoreSheet backup={restoring} onClose={() => setRestoring(null)} />}
    </main>
  )
}
