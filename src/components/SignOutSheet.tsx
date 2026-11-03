import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import { dayKey, displayName, orUnknown, printTime, timeNow } from '../lib/format'
import { rankByReg, signOut, undoSignOut } from '../lib/records'
import { Sheet } from './Sheet'
import { Clearable } from './Clearable'
import { errorText, useToast } from './Toast'

/**
 * Sign a car out: type part of the plate (the last three characters are
 * enough), then tap Out. Below, today's signed-out cars with "Back in", for
 * someone who only went on a break. Both lists narrow as the plate is typed.
 */
export function SignOutSheet({ day, onClose }: { day: string; onClose: () => void }) {
  const notify = useToast()
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const onSite = useLiveQuery(
    async () => (await db.visits.where('day').equals(day).sortBy('createdAt')).filter((v) => v.timeOut === ''),
    [day],
  ) ?? []
  const shown = q.trim() ? rankByReg(onSite, q, 50) : onSite

  // Signed out today, latest first — to put someone back who only went on a break.
  const isToday = day === dayKey()
  const signedOut = useLiveQuery(
    async () => (await db.visits.where('day').equals(day).toArray())
      .filter((v) => v.timeOut !== '')
      .sort((a, b) => b.timeOut.localeCompare(a.timeOut) || b.createdAt - a.createdAt),
    [day],
  ) ?? []
  const shownOut = isToday ? (q.trim() ? rankByReg(signedOut, q, 50) : signedOut) : []

  const backIn = async (id: number, reg: string) => {
    try {
      await undoSignOut(id)
      notify(`${reg} is back on site`)
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  const out = async (id: number, reg: string) => {
    const t = timeNow()
    try {
      await signOut(id, t)
      notify(`${reg} signed out at ${printTime(t)}`)
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  return (
    <Sheet title="Sign out" onClose={onClose}>
      <label className="field">
        <span>Registration</span>
        <Clearable value={q} onClear={() => setQ('')}>
          <input
            ref={input}
            className="reg-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Last 3 letters, e.g. WAE"
          />
        </Clearable>
      </label>
      {onSite.length === 0 ? (
        <p className="empty">Nobody is on site.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No car on site matches “{q.trim().toUpperCase()}”.</p>
      ) : (<>
        <h2 className="sheet-section">On site ({shown.length})</h2>
        <ul className="list">
          {shown.map((v) => (
            <li key={v.id} className="out-row">
              <span className="plate">{v.reg}</span>
              <span className="visit-who">
                <span>{displayName(v.firstName, v.lastName)}</span>
                <span className="muted">{orUnknown(v.company)} · in {printTime(v.timeIn)}</span>
              </span>
              <button type="button" className="btn danger-solid" onClick={() => out(v.id, v.reg)}>Out</button>
            </li>
          ))}
        </ul>
      </>)}

      {shownOut.length > 0 && (
        <>
          <h2 className="sheet-section">Signed out today — came back? ({shownOut.length})</h2>
          <ul className="list">
            {shownOut.map((v) => (
              <li key={v.id} className="out-row">
                <span className="plate">{v.reg}</span>
                <span className="visit-who">
                  <span>{displayName(v.firstName, v.lastName)}</span>
                  <span className="muted">{printTime(v.timeIn)} – {printTime(v.timeOut)}</span>
                </span>
                <button type="button" className="btn" onClick={() => backIn(v.id, v.reg)}>Back in</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}
