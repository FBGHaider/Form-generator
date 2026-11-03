import { useState } from 'react'
import { dayKey, printTime, timeNow } from '../lib/format'
import { endOfDayFor, isFriday, signOutEveryone } from '../lib/records'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

/**
 * Sign out everyone still on site at one time. The working day ends at 17:00,
 * and at 15:30 on Fridays — on a Friday the time can never be later than 15:30.
 * Today it starts at the current time (capped on Fridays); on an earlier day
 * it starts at that day's end.
 */
export function EveryoneOutSheet({ day, count, onClose }: { day: string; count: number; onClose: () => void }) {
  const notify = useToast()
  const end = endOfDayFor(day)
  const friday = isFriday(day)
  const cap = (t: string) => (friday && t > end ? end : t)
  const [time, setTime] = useState(() => (day === dayKey() ? cap(timeNow()) : end))
  const go = async () => {
    const t = cap(time)
    try {
      const n = await signOutEveryone(day, t)
      notify(`${n} signed out at ${printTime(t)}`)
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }
  return (
    <Sheet title="Everyone out" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void go() }}>
        <p>Sign out all <strong>{count}</strong> vehicles still on site at:</p>
        <div className="time-row">
          <input type="time" value={time} max={friday ? end : undefined} required
            onChange={(e) => setTime(cap(e.target.value))} />
          <button type="button" className="btn" onClick={() => setTime(end)}>{end}</button>
          <button type="button" className="btn" onClick={() => setTime(cap(timeNow()))}>Now</button>
        </div>
        {friday && <p className="hint">It's Friday — everyone finishes by 15:30, so the time can't be later than that.</p>}
        <button type="submit" className="btn primary block" disabled={count === 0}>Sign out {count}</button>
      </form>
    </Sheet>
  )
}
