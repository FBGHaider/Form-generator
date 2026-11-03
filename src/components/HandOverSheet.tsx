import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import type { BackupContents } from '../lib/backup'
import { db } from '../lib/db'
import { sendHandover } from '../lib/endOfDay'
import { dayKey, longDay } from '../lib/format'
import { closePastDays } from '../lib/records'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

/**
 * Passing the gate to someone else for the rest of the day, and taking it
 * back. One phone sends everything it has; the other takes it over. Nothing
 * on the receiving phone is overwritten or removed — new sign-ins are added,
 * sign-outs filled in, and real times replace the app's automatic 17:00.
 */
export function HandOverSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const notify = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [incoming, setIncoming] = useState<BackupContents | null>(null)
  const [busy, setBusy] = useState(false)
  const onSite = useLiveQuery(() => db.visits.where('day').equals(today).filter((v) => v.timeOut === '').count(), [today]) ?? 0

  const send = async () => {
    try {
      const outcome = await sendHandover(today)
      if (outcome !== 'cancelled') {
        notify('Handover sent')
        onClose()
      }
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
      setIncoming(await readBackupFile(f))
    } catch (err) {
      notify(`Could not read that file: ${errorText(err)}`, 'error')
    }
  }

  const takeOver = async () => {
    if (!incoming) return
    setBusy(true)
    try {
      const { restoreBackup } = await import('../lib/backup')
      await restoreBackup(incoming)
      await closePastDays(dayKey())
      notify('Taken over — carry on signing in and out')
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
      setBusy(false)
    }
  }

  if (incoming) {
    const todays = incoming.days.get(today) ?? []
    const stillIn = todays.filter((e) => e.timeIn && !e.timeOut).length
    const otherDays = [...incoming.days.keys()].filter((d) => d !== today).length
    return (
      <Sheet title="Take over" onClose={onClose}>
        <p>
          Today, {longDay(today)}: <strong>{todays.length}</strong> signed in, <strong>{stillIn}</strong> still on site.
        </p>
        <p className="hint">
          Also in the file: {incoming.cars.length} cars in the master list{otherDays > 0 && <> and {otherDays} other days</>}.
          Nothing on this phone is overwritten or removed — new sign-ins are added and sign-out times filled in.
        </p>
        <button type="button" className="btn primary block huge" disabled={busy} onClick={takeOver}>Take over</button>
      </Sheet>
    )
  }

  return (
    <Sheet title="Hand over" onClose={onClose}>
      <p className="hint">
        When someone else takes the gate, send them everything on this phone; they tap <strong>Take over</strong> and
        carry on. When you come back — even the next morning — they send it back and you take over again. AirDrop
        works with no signal.
      </p>
      <button type="button" className="btn primary block huge" onClick={send}>Send to the next person</button>
      <p className="hint">Sends today's {onSite} on site, every day, and the master list in one file.</p>
      <div className="or">or</div>
      <button type="button" className="btn block huge" onClick={() => file.current?.click()}>Take over from someone</button>
      <p className="hint">Pick the handover file they sent you (from AirDrop, Files, WhatsApp or Mail).</p>
      <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />
    </Sheet>
  )
}
