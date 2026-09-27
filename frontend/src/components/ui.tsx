import type { ReactNode } from 'react'
import type { ApiError } from '../api/client'

// Shared class names, so every button and input looks and behaves the same.
export const primaryButton =
  'inline-flex items-center justify-center rounded-control bg-indigo px-4 py-2 font-semibold text-white ' +
  'hover:bg-indigo-dark disabled:cursor-not-allowed disabled:opacity-50'
export const quietButton =
  'inline-flex items-center justify-center rounded-control border border-rule bg-surface px-3 py-1.5 text-sm ' +
  'font-medium text-ink hover:border-indigo disabled:cursor-not-allowed disabled:opacity-50'
export const textInput =
  'w-full rounded-control border border-rule bg-surface px-3 py-2 text-ink placeholder:text-slate/70 focus:border-indigo'
export const fieldLabel = 'block text-sm font-semibold'

export const LOW_STOCK_AT = 5 // the shop-wide default low-stock threshold on the backend

/** The one loud element: how many are left, coloured by scarcity. */
export function StockNumber({ quantity, size = 'row' }: { quantity: number; size?: 'row' | 'hero' }) {
  const colour = quantity === 0 ? 'text-madder' : quantity <= LOW_STOCK_AT ? 'text-turmeric' : 'text-indigo'
  const scale = size === 'hero' ? 'text-8xl' : 'text-5xl'
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
    <div role="alert" className="border-l-4 border-madder bg-surface px-4 py-3 text-ink">
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
