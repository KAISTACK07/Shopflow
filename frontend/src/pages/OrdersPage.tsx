import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as api from '../api/endpoints'
import type { Order } from '../api/types'
import { ErrorNotice, Loading, Pager, quietButton } from '../components/ui'
import { formatPaise } from '../lib/money'
import { asApiError, useApi } from '../lib/useApi'

const PAGE_SIZE = 10
const CANCELLABLE = new Set<Order['status']>(['pending', 'confirmed'])
const STATUS_TEXT: Record<Order['status'], string> = {
  pending: 'Placed',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const placed = Number(params.get('placed')) || null
  const offset = Number(params.get('offset') ?? 0) || 0
  const orders = useApi(() => api.listOrders({ limit: PAGE_SIZE, offset }), [offset])

  function replace(updated: Order) {
    if (orders.data) orders.setData({ ...orders.data, items: orders.data.items.map((o) => (o.id === updated.id ? updated : o)) })
  }

  return (
    <section>
      <h1 className="text-5xl">Your orders</h1>
      {placed && <p className="mt-4 border-l-4 border-indigo bg-surface px-4 py-3" role="status">Order #{placed} placed.</p>}
      <div className="mt-6 space-y-4">
        {orders.error && <ErrorNotice error={orders.error} />}
        {orders.loading && !orders.data && <Loading what="your orders" />}
        {orders.data?.items.length === 0 && (
          <p>You haven’t ordered anything yet. <Link to="/" className="text-indigo underline">Browse products</Link></p>
        )}
        {orders.data?.items.map((order) => (
          <OrderCard key={order.id} order={order} highlighted={order.id === placed} onChange={replace} />
        ))}
        {orders.data && (
          <Pager total={orders.data.total} limit={PAGE_SIZE} offset={offset} onChange={(next) => setParams({ offset: String(next) })} />
        )}
      </div>
    </section>
  )
}

function OrderCard({ order, highlighted, onChange }: { order: Order; highlighted: boolean; onChange: (o: Order) => void }) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string>()

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
    <article className={`border bg-surface p-5 ${highlighted ? 'border-indigo' : 'border-rule'}`}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-2xl">Order #{order.id}</h2>
        <span className={`font-semibold ${order.status === 'cancelled' ? 'text-slate' : 'text-ink'}`}>{STATUS_TEXT[order.status]}</span>
        <time className="text-sm text-slate" dateTime={order.created_at}>{dateFormat.format(new Date(order.created_at))}</time>
      </header>
      <ul className="mt-3 space-y-1">
        {order.items.map((item) => (
          <li key={item.product_id} className="flex justify-between gap-4">
            <span>{item.quantity} × {item.name}</span>
            <span className="tabular-nums">{formatPaise(item.line_total_paise)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-3">
        <p className="text-sm text-slate">Ship to: {order.shipping_address}</p>
        <p className="text-lg font-semibold">Total {formatPaise(order.total_paise)}</p>
      </div>
      {CANCELLABLE.has(order.status) && (
        <div className="mt-3">
          <button className={quietButton} onClick={cancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-madder" role="alert">{error}</p>}
    </article>
  )
}
