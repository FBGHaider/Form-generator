import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db } from '../lib/db'
import { importDaySheet, parseDaySheet, parsePastedRows, readDayTabs, type DaySheet, type DayTab } from '../lib/daySheet'
import { displayName, longDay, printTime } from '../lib/format'
import { Sheet } from './Sheet'
import { errorText, useToast } from './Toast'

type Tab = DayTab & { key: string; label: string }

/**
 * Bring days kept in Excel into the app. Pick one or more workbooks and every
 * day tab in them is listed — each goes onto its own date (today's onto
 * Today, older ones under Past days). Or paste one day's rows copied from
 * Excel. Rows with a time in are imported; importing again adds nothing twice.
 */
export function ImportDaySheet({ today, onClose }: { today: string; onClose: () => void }) {
  const notify = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [tabs, setTabs] = useState<Tab[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pasted, setPasted] = useState('')
  const [single, setSingle] = useState<DaySheet | null>(null)
  const [busy, setBusy] = useState(false)

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    try {
      const { readWorkbook } = await import('../lib/excel')
      const all: Tab[] = []
      for (const f of files) {
        for (const t of readDayTabs(await readWorkbook(f))) {
          all.push({ ...t, key: `${f.name}/${t.sheet}`, label: files.length > 1 ? `${f.name} · ${t.sheet}` : t.sheet })
        }
      }
      if (all.length === 0) throw new Error('No day sheets found (a day sheet has Registration and Time in columns).')
      // Oldest first; tick every tab that has a date and someone signed in.
      all.sort((a, b) => (a.day ?? '9').localeCompare(b.day ?? '9'))
      setTabs(all)
      setPicked(new Set(all.filter((t) => t.day && t.signedIn > 0).map((t) => t.key)))
    } catch (err) {
      notify(`Could not read that file: ${errorText(err)}`, 'error')
    }
  }

  const toggle = (key: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const importTabs = async () => {
    if (!tabs) return
    setBusy(true)
    try {
      const chosen = tabs.filter((t) => picked.has(t.key) && t.day)
      let added = 0
      let already = 0
      let out = 0
      const days = new Set<string>()
      for (const t of chosen) {
        const r = await importDaySheet(t.day!, t.entries, db, { updateMaster: t.day === today })
        added += r.added
        already += r.alreadyIn
        out += r.signedOut
        days.add(t.day!)
      }
      const parts = [`${days.size} ${days.size === 1 ? 'day' : 'days'}: ${added} signed in`]
      if (out) parts.push(`${out} signed out`)
      if (already) parts.push(`${already} already there`)
      notify(parts.join(' · '))
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
      setBusy(false)
    }
  }

  // ---- one day pasted ------------------------------------------------------
  const day = single?.day ?? today
  const timed = single?.entries.filter((e) => e.timeIn) ?? []
  const known = useLiveQuery(
    async () => new Map((await db.cars.bulkGet(timed.map((e) => e.reg))).filter((c) => !!c).map((c) => [c!.reg, c!])),
    [timed.map((e) => e.reg).join()],
  )
  const nameOf = (e: (typeof timed)[number]) => {
    const c = known?.get(e.reg)
    return displayName(c?.firstName || e.firstName, c?.firstName ? c.lastName : e.lastName)
  }
  const importPasted = async () => {
    if (!single) return
    setBusy(true)
    try {
      const r = await importDaySheet(day, single.entries, db, { updateMaster: day === today })
      const parts = [`${r.added} signed in`]
      if (r.signedOut) parts.push(`${r.signedOut} signed out`)
      if (r.alreadyIn) parts.push(`${r.alreadyIn} already there`)
      if (r.onSiteAlready.length) parts.push(`${r.onSiteAlready.length} already signed in on the phone`)
      if (r.newCars.length) parts.push(`${r.newCars.length} new to master list`)
      notify(parts.join(' · '))
      onClose()
    } catch (e) {
      notify(errorText(e), 'error')
      setBusy(false)
    }
  }
  const readPasted = () => {
    try {
      setSingle(parseDaySheet(parsePastedRows(pasted)))
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }

  const pickedTabs = tabs?.filter((t) => picked.has(t.key) && t.day) ?? []
  const pickedDays = new Set(pickedTabs.map((t) => t.day)).size

  return (
    <Sheet title="Import sheet" onClose={onClose}>
      {!tabs && !single && (
        <>
          <p className="hint">
            Bring in days kept in Excel — today's, or any number of past days. Each tab goes onto its own date; older
            days appear under Past days. Rows with a time in are imported; rows without one are left off. Importing
            the same file again adds nothing twice.
          </p>
          <button type="button" className="btn primary block" onClick={() => file.current?.click()}>Choose Excel files</button>
          <input ref={file} type="file" hidden multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFiles} />
          <div className="or">or</div>
          <label className="field">
            <span>Paste one day's rows copied from Excel (include the heading row)</span>
            <textarea className="paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6}
              placeholder={'First Name\tLast name\tCompany\tTo see\tTime in\tTime out\tRegistration\n…'} />
          </label>
          <button type="button" className="btn block" disabled={!pasted.trim()} onClick={readPasted}>Read pasted rows</button>
        </>
      )}

      {tabs && (
        <>
          <div className="section-head">
            <span className="muted">{tabs.length} {tabs.length === 1 ? 'sheet' : 'sheets'} found</span>
            <button type="button" className="link" onClick={() => setPicked(picked.size ? new Set() : new Set(tabs.filter((t) => t.day).map((t) => t.key)))}>
              {picked.size ? 'Untick all' : 'Tick all'}
            </button>
          </div>
          <ul className="list">
            {tabs.map((t) => (
              <li key={t.key} className={picked.has(t.key) ? 'day-row picked' : 'day-row'}>
                <label className="pick">
                  <input type="checkbox" disabled={!t.day} checked={picked.has(t.key)} onChange={() => toggle(t.key)} />
                  <span>
                    <strong>{t.day ? longDay(t.day) : 'No date'}</strong>
                    <span className="muted"> · {t.signedIn} signed in{t.day === today ? ' · today' : ''}</span>
                    {t.label !== (t.day ? longDay(t.day) : '') && <span className="muted tab-name">Tab: {t.label}</span>}
                    {t.dateNote && <span className="tab-note">{t.dateNote}</span>}
                    {!t.day && <span className="tab-note">No date in the tab name or a Date line — left out.</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary block" disabled={busy || pickedDays === 0} onClick={importTabs}>
            Import {pickedDays} {pickedDays === 1 ? 'day' : 'days'}
          </button>
          <button type="button" className="btn block" onClick={() => setTabs(null)}>Choose something else</button>
        </>
      )}

      {single && (
        <>
          <p>
            <strong>{timed.length}</strong> signed in, for <strong>{longDay(day)}</strong>.
            {single.entries.length > timed.length && (
              <span className="muted"> {single.entries.length - timed.length} rows have no time in and are left off.</span>
            )}
          </p>
          {day !== today && <div className="notice warn">This is for {longDay(day)}, not today. It will go under Past days.</div>}
          <ul className="list compact">
            {timed.map((e) => (
              <li key={e.reg + e.timeIn} className="day-row">
                <span><span className="plate">{e.reg}</span> {nameOf(e)}</span>
                <span className="visit-time">{printTime(e.timeIn)}{e.timeOut && <> – {printTime(e.timeOut)}</>}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary block" disabled={busy || timed.length === 0} onClick={importPasted}>
            Add {timed.length} to {day === today ? 'today' : longDay(day)}
          </button>
          <button type="button" className="btn block" onClick={() => setSingle(null)}>Choose something else</button>
        </>
      )}
    </Sheet>
  )
}
