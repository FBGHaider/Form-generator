import { useState } from 'react'
import { printTime, timeNow } from '../lib/format'
import { signOutEveryone } from '../lib/records'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

export function EveryoneOutSheet({ day, count, onClose }: { day: string; count: number; onClose: () => void }) {
  const notify = useToast()
  const [time, setTime] = useState(timeNow())
  const go = async () => {
    try {
      const n = await signOutEveryone(day, time)
      notify(`${n} signed out at ${printTime(time)}`)
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
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          <button type="button" className="btn" onClick={() => setTime('17:00')}>17:00</button>
          <button type="button" className="btn" onClick={() => setTime(timeNow())}>Now</button>
        </div>
        <button type="submit" className="btn primary block" disabled={count === 0}>Sign out {count}</button>
      </form>
    </Sheet>
  )
}
