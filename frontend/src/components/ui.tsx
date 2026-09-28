import type { ReactNode } from 'react'
import type { ApiError } from '../api/client'
import { LOW_STOCK_AT, stockLabel, stockLevel, type StockLevel } from '../lib/stock'

export { LOW_STOCK_AT }

// Shared class names, so every button, input and card looks and behaves the same.
const pressable = 'transition duration-150 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'
export const primaryButton =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-indigo px-5 py-2.5 font-semibold text-on-indigo hover:bg-indigo-dark ${pressable}`
/** The dark, high-emphasis button (Add to cart, Shop the collection). */
export const ctaButton =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-cta px-5 py-2.5 font-semibold text-on-cta hover:opacity-90 ${pressable}`
export const quietButton =
  `inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-rule bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:border-indigo ${pressable}`
export const textInput =
  'w-full rounded-control border border-rule bg-surface px-3.5 py-2.5 text-ink placeholder:text-slate/80 transition focus:border-indigo'
export const fieldLabel = 'mb-1.5 block text-sm font-semibold'
export const card = 'rounded-card border border-rule bg-surface shadow-card'

const BADGE_COLOURS: Record<StockLevel, string> = {
  plenty: 'bg-plenty-bg text-plenty-fg',
  low: 'bg-low-bg text-low-fg',
  out: 'bg-out-bg text-out-fg',
}

/** Scarcity pill: "42 left" (indigo), "Only 3 left" (turmeric), "Sold out" (madder). */
export function StockBadge({ quantity, className = '' }: { quantity: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-bold ${BADGE_COLOURS[stockLevel(quantity)]} ${className}`}>
      {stockLabel(quantity)}
    </span>
  )
}

/** The big stock numeral (admin list and product page). */
export function StockNumber({ quantity, size = 'row' }: { quantity: number; size?: 'row' | 'hero' }) {
  const level = stockLevel(quantity)
  const colour = level === 'out' ? 'text-madder' : level === 'low' ? 'text-turmeric' : 'text-indigo'
  const scale = size === 'hero' ? 'text-7xl' : 'text-5xl'
  return (
    <div className={`${colour} text-center`} aria-label={quantity === 0 ? 'Sold out' : `${quantity} left`}>
      <div className={`font-numeral ${scale}`} aria-hidden="true">
        {quantity}
      </div>
      <div className="text-sm font-semibold" aria-hidden="true">
        {quantity === 0 ? 'sold out' : 'left'}
      </div>
    </div>
  )
}

export function ErrorNotice({ error, children }: { error?: ApiError | string; children?: ReactNode }) {
  if (!error && !children) return null
  const message = typeof error === 'string' ? error : error?.message
  return (
    <div role="alert" className="rounded-control border border-out-bg border-l-4 border-l-madder bg-surface px-4 py-3 text-ink">
      {message && <p>{message}</p>}
      {children}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="py-8 text-slate" role="status">
      Loading {what}…
    </p>
  )
}

export function Pager({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
}) {
  if (total <= limit) return null
  const last = Math.min(offset + limit, total)
  return (
    <nav className="flex items-center justify-between py-4 text-sm" aria-label="Pages">
      <span className="text-slate">
        Showing {offset + 1}–{last} of {total}
      </span>
      <span className="flex gap-2">
        <button className={quietButton} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </button>
        <button className={quietButton} disabled={last >= total} onClick={() => onChange(offset + limit)}>
          Next
        </button>
      </span>
    </nav>
  )
}
