import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { TO_SEE_OPTIONS } from '../config'
import { db, type Car, type CarDetails, type Visit } from '../lib/db'
import { displayName, normaliseReg, orUnknown, printTime, timeNow } from '../lib/format'
import { signIn, suggestCars } from '../lib/records'
import { DetailsFields } from './DetailsFields'
import { MissingName } from './MissingName'
import { Sheet } from './Sheet'
import { Clearable } from './Clearable'
import { errorText, useToast } from './Toast'

const blank: CarDetails = { firstName: '', lastName: '', company: '', toSee: TO_SEE_OPTIONS[0] }
const fromCar = (c: Car): CarDetails => ({
  firstName: c.firstName, lastName: c.lastName, company: c.company, toSee: c.toSee || TO_SEE_OPTIONS[0],
})

export function SignInSheet({ day, onClose, onOpenVisit, onDone }: {
  day: string
  onClose: () => void
  onOpenVisit: (v: Visit) => void
  /** Called after a car was signed in. */
  onDone?: () => void
}) {
  const notify = useToast()
  const [regText, setRegText] = useState('')
  const [details, setDetails] = useState<CarDetails | null>(null) // null = not chosen yet
  const [isNew, setIsNew] = useState(false)
  const [editing, setEditing] = useState(false)
  const [timeIn, setTimeIn] = useState(timeNow())
  const [saving, setSaving] = useState(false)
  const regInput = useRef<HTMLInputElement>(null)

  useEffect(() => regInput.current?.focus(), [])

  const reg = normaliseReg(regText)
  const lookup = useLiveQuery(async () => (reg ? (await db.cars.get(reg)) ?? null : null), [reg], 'loading' as const)
  const loading = lookup === 'loading'
  const exact = loading ? undefined : lookup ?? undefined
  const suggestions = useLiveQuery(() => suggestCars(reg), [reg]) ?? []
  const onSiteRegs = useLiveQuery(
    async () => new Set((await db.visits.where('day').equals(day).toArray()).filter((v) => v.timeOut === '').map((v) => v.reg)),
    [day],
  ) ?? new Set<string>()
  const alreadyIn = useLiveQuery(
    () => (reg ? db.visits.where('day').equals(day).filter((v) => v.reg === reg && v.timeOut === '').first() : undefined),
    [reg, day],
  )

  // A typed registration that matches the master list fills in the details.
  useEffect(() => {
    if (loading) return
    if (exact && !isNew) {
      setDetails(fromCar(exact))
      setEditing(false)
    } else if (!exact && !isNew) {
      setDetails(null)
    }
  }, [exact, isNew, loading])

  const pick = (c: Car) => {
    setRegText(c.reg)
    setIsNew(false)
  }

  const addNew = () => {
    setIsNew(true)
    setEditing(true)
    setDetails({ ...blank })
  }

  const onRegChange = (text: string) => {
    setRegText(text)
    if (isNew) {
      setIsNew(false)
      setDetails(null)
    }
  }

  const save = async () => {
    if (!reg || !details) return
    setSaving(true)
    try {
      await signIn(reg, details, day, timeIn)
      notify(`${reg} signed in at ${printTime(timeIn)}${isNew ? ' — added to master list' : ''}`)
      onDone?.()
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
      setSaving(false)
    }
  }

  const showSuggestions = !exact && !isNew && suggestions.length > 0

  return (
    <Sheet title="Sign in" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <label className="field">
          <span>Registration</span>
          <Clearable value={regText} onClear={() => onRegChange('')}>
            <input
              ref={regInput}
              className="reg-input"
              value={regText}
              onChange={(e) => onRegChange(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="Last 3 letters, e.g. WAE"
            />
          </Clearable>
        </label>

        {showSuggestions && (
          <ul className="suggestions">
            {suggestions.map((c) => (
              <li key={c.reg}>
                <button type="button" onClick={() => pick(c)}>
                  <span className="plate">{c.reg}</span>
                  <span className="suggestion-who">{displayName(c.firstName, c.lastName)} · {orUnknown(c.company)}</span>
                  {onSiteRegs.has(c.reg) && <span className="tag">on site</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {alreadyIn && (
          <div className="notice warn">
            {reg} is already on site, signed in at {printTime(alreadyIn.timeIn)}.
            <button type="button" className="btn small" onClick={() => onOpenVisit(alreadyIn)}>Sign it out</button>
          </div>
        )}

        {reg.length >= 2 && !loading && !exact && !isNew && (
          showSuggestions ? (
            <div className="none-of-these">
              None of these?
              <button type="button" className="link" onClick={addNew}>+ Add {reg} as a new car</button>
            </div>
          ) : (
            <div className="notice">
              <strong>{reg}</strong> is not in your master list.
              <button type="button" className="btn primary" onClick={addNew}>+ Add new car</button>
            </div>
          )
        )}

        {details && exact && !editing && (
          <div className="known">
            <div className="known-tag">In master list</div>
            <div className="known-name">{displayName(details.firstName, details.lastName)}</div>
            <div className="known-meta">{orUnknown(details.company)} · to see {orUnknown(details.toSee)}</div>
            <div className="chips">
              {TO_SEE_OPTIONS.map((o) => (
                <button type="button" key={o} className={details.toSee === o ? 'chip on' : 'chip'} onClick={() => setDetails({ ...details, toSee: o })}>
                  {o}
                </button>
              ))}
              <button type="button" className="link" onClick={() => setEditing(true)}>Edit details</button>
            </div>
            <MissingName key={reg} reg={reg} firstName={details.firstName} lastName={details.lastName} day={day}
              onSaved={(firstName, lastName) => setDetails({ ...details, firstName, lastName })} />
          </div>
        )}

        {details && editing && <DetailsFields value={details} onChange={setDetails} />}
        {details && isNew && <p className="hint">This car will be added to your master list.</p>}

        {details && (
          <>
            <div className="field">
              <span>Time in</span>
              <div className="time-row">
                <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} required />
                <button type="button" className="btn" onClick={() => setTimeIn(timeNow())}>Now</button>
              </div>
            </div>
            <button type="submit" className="btn primary block" disabled={saving || !!alreadyIn}>
              Sign in {reg}
            </button>
          </>
        )}
      </form>
    </Sheet>
  )
}
