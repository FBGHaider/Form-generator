import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { TO_SEE_OPTIONS } from '../config'
import { db, type Car, type CarDetails } from '../lib/db'
import { dayKey, displayName, fileDay, normaliseReg, orUnknown, printTime, timeNow } from '../lib/format'
import type { MasterFileResult } from '../lib/excel'
import { importCars } from '../lib/master'
import { deleteCar, openVisit, saveCar, signIn } from '../lib/records'
import { shareFile } from '../lib/share'
import { DetailsFields } from './DetailsFields'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

function ImportSheet({ result, onClose, onDone }: { result: MasterFileResult; onClose: () => void; onDone: () => void }) {
  const notify = useToast()
  const go = async () => {
    try {
      const r = await importCars(result.cars)
      notify(`Master list: ${r.added} added, ${r.updated} updated`)
      onDone()
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }
  return (
    <Sheet title="Import master list" onClose={onClose}>
      <p>
        Found <strong>{result.cars.length}</strong> cars across {result.sheets.length}{' '}
        {result.sheets.length === 1 ? 'sheet' : 'sheets'}
        {result.sheets.length > 1 && <> ({result.sheets[0]} to {result.sheets[result.sheets.length - 1]})</>}.
      </p>
      <p className="hint">Where a car's details differ between days, the newest day is used.</p>
      {result.ignored.length > 0 && (
        <p className="hint">Skipped sheets with no Registration column: {result.ignored.join(', ')}</p>
      )}
      {result.skipped > 0 && <p className="hint">{result.skipped} rows had no proper registration and were left out.</p>}
      <p className="hint">Cars already in the app are updated from the file. Cars you added on the phone are kept.</p>
      <button type="button" className="btn primary block" onClick={go} disabled={result.cars.length === 0}>
        Import {result.cars.length} cars
      </button>
    </Sheet>
  )
}

/** `onDone` runs after the car was saved or deleted; `onClose` on any close, Cancel included. */
function CarSheet({ car, day, onClose, onDone }: { car: Car | null; day: string; onClose: () => void; onDone: () => void }) {
  const notify = useToast()
  const [reg, setReg] = useState(car?.reg ?? '')
  const [details, setDetails] = useState<CarDetails>(
    car ? { firstName: car.firstName, lastName: car.lastName, company: car.company, toSee: car.toSee } :
      { firstName: '', lastName: '', company: '', toSee: TO_SEE_OPTIONS[0] },
  )
  const [onSiteNow, setOnSiteNow] = useState(false)
  const [timeIn, setTimeIn] = useState(timeNow())
  const r = normaliseReg(reg)
  const alreadyIn = useLiveQuery(() => (r ? openVisit(r, day) : undefined), [r, day])

  const save = async () => {
    try {
      if (!car && (await db.cars.get(r))) throw new Error(`${r} is already in the master list`)
      if (onSiteNow && !alreadyIn) {
        // Signing in also saves the details to the master list.
        await signIn(r, details, day, timeIn)
        notify(`${r} saved and signed in at ${printTime(timeIn)}`)
      } else {
        await saveCar(r, details)
        notify(`${r} saved`)
      }
      onDone()
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }
  return (
    <Sheet title={car ? car.reg : 'Add car'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        {!car && (
          <label className="field">
            <span>Registration</span>
            <input className="reg-input" value={reg} onChange={(e) => setReg(e.target.value)} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} required />
          </label>
        )}
        <DetailsFields value={details} onChange={setDetails} />
        {alreadyIn ? (
          <div className="notice">On site now — signed in at {printTime(alreadyIn.timeIn)}.</div>
        ) : (
          <div className="field">
            <span>On site right now?</span>
            <div className="chips">
              <button type="button" className={onSiteNow ? 'chip on' : 'chip'} onClick={() => { setOnSiteNow(true); setTimeIn(timeNow()) }}>Yes</button>
              <button type="button" className={onSiteNow ? 'chip' : 'chip on'} onClick={() => setOnSiteNow(false)}>No</button>
            </div>
            {onSiteNow && (
              <div className="time-row">
                <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} required aria-label="Time in" />
                <button type="button" className="btn" onClick={() => setTimeIn(timeNow())}>Now</button>
              </div>
            )}
          </div>
        )}
        <button type="submit" className="btn primary block">{onSiteNow && !alreadyIn ? 'Save and sign in' : 'Save'}</button>
        {car && (
          <button type="button" className="btn danger block" onClick={async () => {
            if (!confirm(`Delete ${car.reg} from the master list? Past sheets are not changed.`)) return
            await deleteCar(car.reg)
            notify(`${car.reg} deleted`)
            onDone()
            onClose()
          }}>Delete from master list</button>
        )}
      </form>
    </Sheet>
  )
}

export function MasterScreen({ day }: { day: string }) {
  const notify = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState<MasterFileResult | null>(null)
  const [editing, setEditing] = useState<Car | null | undefined>(undefined) // null = new car
  const cars = useLiveQuery(() => db.cars.orderBy('reg').toArray(), []) ?? []

  const needle = q.trim().toLowerCase()
  const reg = normaliseReg(q)
  const shown = needle
    ? cars.filter((c) => (reg && c.reg.includes(reg)) || `${c.firstName} ${c.lastName} ${c.company}`.toLowerCase().includes(needle))
    : cars

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const { readMasterFile } = await import('../lib/excel')
      setImporting(await readMasterFile(f))
    } catch (err) {
      notify(`Could not read that file: ${errorText(err)}`, 'error')
    }
  }

  const exportXlsx = async () => {
    try {
      const { masterToXlsx } = await import('../lib/excel')
      await shareFile(await masterToXlsx(cars), `Master_list_${fileDay(dayKey())}.xlsx`)
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <h1>Master list</h1>
          <div className="muted">{cars.length} cars</div>
        </div>
        <button type="button" className="btn" onClick={() => setEditing(null)}>+ Add car</button>
      </header>

      <div className="button-row">
        <button type="button" className="btn" onClick={() => file.current?.click()}>Import Excel</button>
        <button type="button" className="btn" onClick={exportXlsx} disabled={cars.length === 0}>Export to Excel</button>
        <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />
      </div>
      <p className="hint">Export now and then and keep the file somewhere safe — it is your backup.</p>

      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search registration or name" autoComplete="off" autoCorrect="off" spellCheck={false} />

      {shown.length === 0 ? (
        <p className="empty">{cars.length === 0 ? 'No cars yet. Import your master Excel file, or add cars as they arrive.' : 'No match.'}</p>
      ) : (
        <ul className="list">
          {shown.map((c) => (
            <li key={c.reg}>
              <button type="button" className="visit" onClick={() => setEditing(c)}>
                <span className="plate">{c.reg}</span>
                <span className="visit-who">
                  <span>{displayName(c.firstName, c.lastName)}</span>
                  <span className="muted">{orUnknown(c.company)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {importing && <ImportSheet result={importing} onClose={() => setImporting(null)} onDone={() => setQ('')} />}
      {editing !== undefined && <CarSheet car={editing} day={day} onClose={() => setEditing(undefined)} onDone={() => setQ('')} />}
    </main>
  )
}
