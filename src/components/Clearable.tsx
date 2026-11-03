import type { ReactNode } from 'react'

/**
 * A box with a small ✕ inside it that empties it in one tap. The ✕ only shows
 * when something is typed. Tapping it keeps the keyboard up (the box stays
 * focused) so the next search can be typed straight away.
 */
export function Clearable({ value, onClear, children, className = '' }: {
  value: string
  onClear: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`clearable ${className}`}>
      {children}
      {value !== '' && (
        <button
          type="button"
          className="clear-btn"
          aria-label="Clear"
          // Keep the box focused, so the keyboard does not drop and come back.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            onClear()
            const box = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null)
            box?.focus()
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
