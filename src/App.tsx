import { useEffect, useState } from 'react'
import { EveryoneOutSheet } from './components/EveryoneOutSheet'
import { HandOverSheet } from './components/HandOverSheet'
import { HistoryScreen } from './components/HistoryScreen'
import { ImportDaySheet } from './components/ImportDaySheet'
import { MasterScreen } from './components/MasterScreen'
import { SignInSheet } from './components/SignInSheet'
import { SignOutSheet } from './components/SignOutSheet'
import { TodayScreen } from './components/TodayScreen'
import { VisitSheet } from './components/VisitSheet'
import { dayKey } from './lib/format'
import { closePastDays } from './lib/records'

type Tab = 'today' | 'master' | 'history'

/** Today's date, kept current so a new sheet starts on its own after midnight. */
function useToday() {
  const [day, setDay] = useState(dayKey())
  useEffect(() => {
    const tick = () => setDay(dayKey())
    const t = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return day
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function InstallHint() {
  const [hidden, setHidden] = useState(() => isStandalone())
  if (hidden) return null
  return (
    <div className="install-hint">
      <span>
        Add this to your Home Screen so it works with no signal and your data is kept safe:
        tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
      </span>
      <button type="button" className="link" onClick={() => setHidden(true)}>OK</button>
    </div>
  )
}

export function App() {
  const day = useToday()
  // When the app opens and when a new day starts, anyone still signed in on
  // an earlier day is signed out at 17:00.
  useEffect(() => {
    void closePastDays(day)
  }, [day])
  const [tab, setTab] = useState<Tab>('today')
  // The day shown on the Today tab: today, or an earlier day being looked at.
  const [viewing, setViewing] = useState<string | null>(null)
  const shown = viewing && viewing < day ? viewing : day
  const showDay = (d: string) => setViewing(d >= day ? null : d)
  const [signingIn, setSigningIn] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [everyoneOut, setEveryoneOut] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [handingOver, setHandingOver] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  // Bumped after a car is changed, to empty the Today search box.
  const [clearSearch, setClearSearch] = useState(0)

  return (
    <div className="app">
      <InstallHint />
      {tab === 'today' && (
        <TodayScreen day={shown} today={day} onDay={showDay} onOpen={(v) => setOpenId(v.id)} onEveryoneOut={setEveryoneOut}
          onImport={() => setImporting(true)} onSignIn={() => setSigningIn(true)} onSignOut={() => setSigningOut(true)} clearSearch={clearSearch}
          onHandOver={() => setHandingOver(true)} />
      )}
      {tab === 'master' && <MasterScreen day={day} />}
      {tab === 'history' && <HistoryScreen onOpenDay={(d) => { showDay(d); setTab('today') }} />}


      <nav className="tabs">
        {(['today', 'master', 'history'] as const).map((t) => (
          <button type="button" key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ today: 'Today', master: 'Master list', history: 'Past days' }[t]}
          </button>
        ))}
      </nav>

      {signingIn && (
        <SignInSheet
          day={shown}
          onClose={() => setSigningIn(false)}
          // A car added to an earlier day is signed out at 17:00 like the rest of that day.
          onDone={() => { if (shown < day) void closePastDays(day) }}
          onOpenVisit={(v) => { setSigningIn(false); setOpenId(v.id) }}
        />
      )}
      {signingOut && <SignOutSheet day={shown} onClose={() => setSigningOut(false)} />}
      {openId !== null && <VisitSheet id={openId} onClose={() => setOpenId(null)} onDone={() => setClearSearch((n) => n + 1)} />}
      {handingOver && <HandOverSheet today={day} onClose={() => setHandingOver(false)} />}
      {importing && <ImportDaySheet today={day} onClose={() => setImporting(false)} />}
      {everyoneOut !== null && <EveryoneOutSheet day={shown} count={everyoneOut} onClose={() => setEveryoneOut(null)} />}
    </div>
  )
}
