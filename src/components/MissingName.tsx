import { useState } from 'react'
import { UNKNOWN } from '../config'
import { setDriverName } from '../lib/records'
import { errorText, useToast } from './Toast'

const known = (s: string) => s.trim() !== '' && s.trim() !== UNKNOWN

/**
 * A red note when a driver has no last name, with a button to type it in on
 * the spot. Saved to the master list and to that day's sheet. Shows nothing
 * when the full name is known.
 */
export function MissingName({ reg, firstName, lastName, day, onSaved }: {
  reg: string
  firstName: string
  lastName: string
  day: string
  onSaved?: (firstName: string, lastName: string) => void
}) {
  const notify = useToast()
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState(known(firstName) ? firstName : '')
  const [last, setLast] = useState('')
  const [saving, setSaving] = useState(false)
  if (known(lastName)) return null

  const noName = !known(firstName)
  const save = async () => {
    setSaving(true)
    try {
      await setDriverName(reg, first, last, day)
      notify(`Saved: ${[first.trim(), last.trim()].filter(Boolean).join(' ')}`)
      onSaved?.(first.trim(), last.trim())
      setOpen(false)
    } catch (e) {
      notify(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="missing-name" role="note">
      <div className="missing-name-text">
        {noName ? <>No name for this driver yet.</> : <><strong>{firstName}</strong> has no last name yet.</>}
      </div>
      {!open ? (
        <button type="button" className="btn danger-solid" onClick={() => setOpen(true)}>
          {noName ? 'Enter name now' : 'Enter last name now'}
        </button>
      ) : (
        <div className="missing-name-form">
          {noName && (
            <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name"
              autoCapitalize="words" autoComplete="off" aria-label="First name" />
          )}
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name"
            autoCapitalize="words" autoComplete="off" aria-label="Last name" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} />
          <div className="time-row">
            <button type="button" className="btn danger-solid" disabled={saving || !last.trim()} onClick={save}>Save</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Not now</button>
          </div>
        </div>
      )}
    </div>
  )
}
