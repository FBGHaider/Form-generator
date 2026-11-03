import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import type { BackupContents } from '../lib/backup'
import { dayKey, groupByWeek, longDay, weekdayDay, weekLabel, weekStart } from '../lib/format'
import { lastSentDay, sendBackup } from '../lib/endOfDay'
import { closePastDays, daysWithVisits, deleteDays, visitsFor } from '../lib/records'
import { shareFile, shareFiles } from '../lib/share'
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
      await closePastDays(dayKey())
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

export function HistoryScreen({ onOpenDay }: { onOpenDay: (day: string) => void }) {
  const notify = useToast()
  const days = useLiveQuery(() => daysWithVisits(), []) ?? []
  const file = useRef<HTMLInputElement>(null)
  const [restoring, setRestoring] = useState<BackupContents | null>(null)
  const [sent, setSent] = useState(lastSentDay())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sharing, setSharing] = useState(false)

  const toggle = (day: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  const today = dayKey()
  const monday = weekStart(today)
  const thisWeek = days.filter((d) => d.day >= monday && d.day <= today).map((d) => d.day)

  const deleteSelected = async () => {
    const chosen = [...selected].sort()
    const n = chosen.length
    const list = n <= 4 ? chosen.map(longDay).join(', ') : `${n} days, ${longDay(chosen[0])} to ${longDay(chosen[n - 1])}`
    if (!confirm(`Delete ${list}?\n\nEvery sign-in on ${n === 1 ? 'that day' : 'those days'} is removed from this phone. This cannot be undone unless you have a backup. The master list is not changed.`)) return
    try {
      const rows = await deleteDays(chosen)
      notify(`Deleted ${n} ${n === 1 ? 'day' : 'days'} (${rows} sign-ins)`)
      setSelected(new Set())
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  /** One PDF per selected day, oldest first, all in one share sheet. */
  const shareSelected = async () => {
    const chosen = [...selected].sort()
    if (chosen.length === 0) return
    setSharing(true)
    try {
      const { dayPdfBlob, pdfFileName } = await import('../lib/pdf')
      const files = await Promise.all(chosen.map(async (d) => ({ blob: dayPdfBlob(d, await visitsFor(d)), name: pdfFileName(d) })))
      const title = chosen.length === 1
        ? `Vehicle Records ${longDay(chosen[0])}`
        : `Vehicle Records ${longDay(chosen[0])} to ${longDay(chosen[chosen.length - 1])}`
      const outcome = await shareFiles(files, title)
      if (outcome !== 'cancelled') setSelected(new Set())
    } catch (e) {
      notify(errorText(e), 'error')
    } finally {
      setSharing(false)
    }
  }

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
        <div className="section-head">
          <h2>Days</h2>
          {days.length > 0 && (
            selected.size > 0
              ? <button type="button" className="link" onClick={() => setSelected(new Set())}>Clear</button>
              : <button type="button" className="link" disabled={thisWeek.length === 0} onClick={() => setSelected(new Set(thisWeek))}>Select this week</button>
          )}
        </div>
        {days.length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          <>
            <p className="hint">Tick days to share or delete them. Open shows a day with everything you can do on Today.</p>
            {groupByWeek(days).map((week) => {
              const weekDays = week.days.map((d) => d.day)
              const allPicked = weekDays.every((d) => selected.has(d))
              return (
            <div key={week.monday} className="week">
            <div className="week-head">
              <span>Week of {weekLabel(week.monday)}</span>
              <button type="button" className="link" onClick={() => setSelected((s) => {
                const next = new Set(s)
                for (const d of weekDays) {
                  if (allPicked) next.delete(d)
                  else next.add(d)
                }
                return next
              })}>{allPicked ? 'Untick' : 'Select'}</button>
            </div>
            <ul className="list">
              {week.days.map(({ day, count }) => (
                <li key={day} className={selected.has(day) ? 'day-row picked' : 'day-row'}>
                  <label className="pick">
                    <input type="checkbox" checked={selected.has(day)} onChange={() => toggle(day)} />
                    <span>
                      <strong>{weekdayDay(day).split(' ')[0].slice(0, 3)} {longDay(day)}</strong>
                      <span className="muted"> · {count} vehicles</span>
                    </span>
                  </label>
                  <button type="button" className="btn small" onClick={() => onOpenDay(day)}>Open</button>
                  <button type="button" className="btn small" onClick={() => exportDay(day)}>PDF</button>
                </li>
              ))}
            </ul>
            </div>
              )
            })}
          </>
        )}
      </section>

      {selected.size > 0 && (
        <div className="share-bar">
          <span>{selected.size} {selected.size === 1 ? 'day' : 'days'}</span>
          <span className="share-bar-buttons">
            <button type="button" className="btn danger-solid" onClick={deleteSelected}>Delete</button>
            <button type="button" className="btn primary" disabled={sharing} onClick={shareSelected}>
              Share {selected.size} {selected.size === 1 ? 'PDF' : 'PDFs'}
            </button>
          </span>
        </div>
      )}

      {restoring && <RestoreSheet backup={restoring} onClose={() => setRestoring(null)} />}
    </main>
  )
}
