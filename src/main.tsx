import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ToastProvider } from './components/Toast'
import { requestPersistentStorage } from './lib/db'
import './styles.css'

// Cache the app on the phone so it opens with no signal, and pick up new
// versions on their own the next time there is signal.
registerSW({ immediate: true })
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
