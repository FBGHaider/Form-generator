import { TO_SEE_OPTIONS, UNKNOWN } from '../config'
import type { CarDetails } from '../lib/db'

/** First name, last name, company and "to see". Empty boxes print as "//". */
export function DetailsFields({ value, onChange }: { value: CarDetails; onChange: (v: CarDetails) => void }) {
  const set = (k: keyof CarDetails) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  const quick = (TO_SEE_OPTIONS as readonly string[]).includes(value.toSee)

  return (
    <>
      <div className="row2">
        <label className="field">
          <span>First name</span>
          <input value={value.firstName} onChange={set('firstName')} autoCapitalize="words" autoComplete="off" placeholder={UNKNOWN} />
        </label>
        <label className="field">
          <span>Last name</span>
          <input value={value.lastName} onChange={set('lastName')} autoCapitalize="words" autoComplete="off" placeholder={UNKNOWN} />
        </label>
      </div>
      <label className="field">
        <span>Company</span>
        <input value={value.company} onChange={set('company')} autoCapitalize="words" autoComplete="off" placeholder={UNKNOWN} />
      </label>
      <div className="field">
        <span>To see</span>
        <div className="chips">
          {TO_SEE_OPTIONS.map((o) => (
            <button type="button" key={o} className={value.toSee === o ? 'chip on' : 'chip'} onClick={() => onChange({ ...value, toSee: o })}>
              {o}
            </button>
          ))}
        </div>
        <input
          value={quick ? '' : value.toSee}
          onChange={set('toSee')}
          autoCapitalize="words"
          autoComplete="off"
          placeholder="Someone else…"
          aria-label="To see, someone else"
        />
      </div>
      <p className="hint">Leave a box empty if you don't know it yet — it prints as {UNKNOWN}.</p>
    </>
  )
}
