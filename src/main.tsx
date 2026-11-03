import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ToastProvider } from './components/Toast'
import { requestPersistentStorage } from './lib/db'
import './styles.css'

// Cache the app on the phone so it opens with no signal, and pick up new
// versions on their own the next time there is signal.
//
// The browser only looks for a new version when the page is loaded, and an
// iPhone Home Screen app is usually resumed rather than reloaded — so also
// look whenever the app is brought back to the screen or signal returns. A
// new version found this way installs and the app reloads itself onto it.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registration.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
  },
})
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
