import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type CarDetails } from '../lib/db'
import { displayName, orUnknown, printTime, timeNow } from '../lib/format'
import { deleteVisit, signOut, updateVisit } from '../lib/records'
import { DetailsFields } from './DetailsFields'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

/** One row of the day: sign it out, correct it, or remove it. */
export function VisitSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const notify = useToast()
  const visit = useLiveQuery(() => db.visits.get(id), [id])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<(CarDetails & { timeIn: string; timeOut: string }) | null>(null)

  if (!visit) return <Sheet title="Vehicle" onClose={onClose}><p className="hint">Loading…</p></Sheet>

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      notify(done)
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  const startEdit = () => {
    setDraft({
      firstName: visit.firstName, lastName: visit.lastName, company: visit.company, toSee: visit.toSee,
      timeIn: visit.timeIn, timeOut: visit.timeOut,
    })
    setEditing(true)
  }

  if (editing && draft) {
    return (
      <Sheet title={`Edit ${visit.reg}`} onClose={onClose}>
        <form onSubmit={(e) => { e.preventDefault(); void run(() => updateVisit(id, draft), 'Saved') }}>
          <DetailsFields value={draft} onChange={(d) => setDraft({ ...draft, ...d })} />
          <div className="row2">
            <label className="field">
              <span>Time in</span>
              <input type="time" value={draft.timeIn} onChange={(e) => setDraft({ ...draft, timeIn: e.target.value })} required />
            </label>
            <label className="field">
              <span>Time out</span>
              <input type="time" value={draft.timeOut} onChange={(e) => setDraft({ ...draft, timeOut: e.target.value })} />
            </label>
          </div>
          <p className="hint">Changes to the name or company are saved to the master list too.</p>
          <button type="submit" className="btn primary block">Save changes</button>
          <button
            type="button"
            className="btn danger block"
            onClick={() => confirm(`Remove ${visit.reg} from this day's sheet?`) && void run(() => deleteVisit(id), `${visit.reg} removed`)}
          >
            Remove from sheet
          </button>
        </form>
      </Sheet>
    )
  }

  const onSite = visit.timeOut === ''
  return (
    <Sheet title={visit.reg} onClose={onClose}>
      <div className="known">
        <div className="plate big">{visit.reg}</div>
        <div className="known-name">{displayName(visit.firstName, visit.lastName)}</div>
        <div className="known-meta">{orUnknown(visit.company)} · to see {orUnknown(visit.toSee)}</div>
        <div className="known-meta">
          In {printTime(visit.timeIn)}{onSite ? ' · on site now' : ` · out ${printTime(visit.timeOut)}`}
        </div>
      </div>
      {onSite && (
        <button type="button" className="btn primary block huge" onClick={() => {
          const t = timeNow()
          void run(() => signOut(id, t), `${visit.reg} signed out at ${printTime(t)}`)
        }}>
          Time out now
        </button>
      )}
      <button type="button" className="btn block" onClick={startEdit}>Edit / change times</button>
    </Sheet>
  )
}
