import { useEffect, type ReactNode } from 'react'

/** A full-height panel that slides over the current screen. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <button type="button" className="link" onClick={onClose}>Cancel</button>
          <h2>{title}</h2>
          <span className="sheet-header-spacer" />
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
