import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as api from '../api/endpoints'
import type { Order } from '../api/types'
import { Skeleton } from '../components/bits'
import { ArrowRight, BagIcon } from '../components/icons'
import { ErrorNotice, Pager, card, ctaButton, quietButton } from '../components/ui'
import { catalogFor } from '../lib/catalog'
import { formatPaise } from '../lib/money'
import { asApiError, useApi } from '../lib/useApi'

const PAGE_SIZE = 10
const CANCELLABLE = new Set<Order['status']>(['pending', 'confirmed'])
const STATUS: Record<Order['status'], { text: string; style: string }> = {
  pending: { text: 'Placed', style: 'bg-plenty-bg text-plenty-fg' },
  confirmed: { text: 'Confirmed', style: 'bg-plenty-bg text-plenty-fg' },
  shipped: { text: 'Shipped', style: 'bg-surface-2 text-ink' },
  cancelled: { text: 'Cancelled', style: 'bg-out-bg text-out-fg' },
}
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const placed = Number(params.get('placed')) || null
  const replayed = params.get('replayed') === '1'
  const offset = Number(params.get('offset') ?? 0) || 0
  const orders = useApi(() => api.listOrders({ limit: PAGE_SIZE, offset }), [offset])

  function replace(updated: Order) {
    if (orders.data) orders.setData({ ...orders.data, items: orders.data.items.map((o) => (o.id === updated.id ? updated : o)) })
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-4xl sm:text-5xl">Your orders</h1>
      {placed && (
        <p className="rounded-card border border-plenty-bg border-l-4 border-l-indigo bg-surface px-4 py-3 font-semibold" role="status">
          {replayed
            ? `Order #${placed} was already placed, so no second order was created. Here it is.`
            : `Order #${placed} placed. Thank you!`}
        </p>
      )}
      {orders.error && <ErrorNotice error={orders.error} />}
      {orders.loading && !orders.data && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading your orders">
          {[0, 1].map((i) => <Skeleton key={i} className="h-48 w-full rounded-card" />)}
        </div>
      )}
      {orders.data?.items.length === 0 && (
        <div className={`${card} flex flex-col items-center gap-4 px-6 py-12 text-center`}>
          <span className="grid size-16 place-items-center rounded-pill bg-plenty-bg text-plenty-fg"><BagIcon size={28} /></span>
          <h2 className="text-3xl">No orders yet</h2>
          <p className="text-slate">When you buy something, it shows up here.</p>
          <Link to="/?category=All" className={ctaButton}>Start shopping <ArrowRight size={18} /></Link>
        </div>
      )}
      {orders.data?.items.map((order) => (
        <OrderCard key={order.id} order={order} highlighted={order.id === placed} onChange={replace} />
      ))}
      {orders.data && (
        <Pager total={orders.data.total} limit={PAGE_SIZE} offset={offset} onChange={(next) => setParams({ offset: String(next) })} />
      )}
    </section>
  )
}

function OrderCard({ order, highlighted, onChange }: { order: Order; highlighted: boolean; onChange: (o: Order) => void }) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string>()
  const status = STATUS[order.status]

  async function cancel() {
    if (!window.confirm(`Cancel order #${order.id}? The items go back on sale.`)) return
    setCancelling(true)
    setError(undefined)
    try {
      onChange(await api.cancelOrder(order.id))
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <article className={`${card} p-5 ${highlighted ? 'ring-2 ring-indigo' : ''}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-2xl">Order #{order.id}</h2>
        <span className={`rounded-pill px-2.5 py-1 text-xs font-bold ${status.style}`}>{status.text}</span>
        <time className="text-sm text-slate sm:ml-auto" dateTime={order.created_at}>{dateFormat.format(new Date(order.created_at))}</time>
      </header>
      <ul className="mt-4 flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.product_id} className="flex items-center gap-3">
            <img src={catalogFor(item.sku).imageUrl} alt="" className="h-16 w-12 shrink-0 rounded-[8px] object-cover" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate">{catalogFor(item.sku).brand}</span>
              <span className="font-semibold">{item.quantity} × {item.name}</span>
            </span>
            <span className="font-bold tabular-nums">{formatPaise(item.line_total_paise)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-rule pt-4">
        <p className="max-w-md text-sm whitespace-pre-line text-slate"><span className="font-semibold text-ink">Ship to:</span> {order.shipping_address}</p>
        <p className="text-lg font-extrabold">Total {formatPaise(order.total_paise)}</p>
      </div>
      {CANCELLABLE.has(order.status) && (
        <div className="mt-4">
          <button className={quietButton} onClick={cancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-madder" role="alert">{error}</p>}
    </article>
  )
}
