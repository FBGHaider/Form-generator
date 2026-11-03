import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Notify = (message: string, kind?: 'ok' | 'error') => void
const ToastContext = createContext<Notify>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const notify = useCallback<Notify>((message, kind = 'ok') => {
    window.clearTimeout(timer.current)
    setToast({ message, kind })
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2000)
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status" onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
