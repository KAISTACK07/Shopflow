import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * A modal panel: from the right on wide screens, from the bottom on phones (side="auto"), or always from one side.
 * Escape and the backdrop close it; focus moves in on open, stays inside (Tab wraps), and returns to where it was.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = 'auto',
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  side?: 'auto' | 'right' | 'bottom'
  footer?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // the page behind shouldn't scroll
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  const placement =
    side === 'right'
      ? 'inset-y-0 right-0 w-full max-w-md animate-drawer-right'
      : side === 'bottom'
        ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-hero animate-drawer-up'
        : 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-hero animate-drawer-up md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-full md:max-w-md md:rounded-none md:animate-drawer-right'

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/45" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`absolute flex flex-col bg-surface shadow-lift ${placement}`}>
        <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4">
          <h2 id={titleId} className="text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-pill hover:bg-surface-2" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-rule px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">{footer}</div>}
      </div>
    </div>
  )
}
