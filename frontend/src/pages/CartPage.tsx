import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ApiError } from '../api/client'
import * as api from '../api/endpoints'
import type { Cart, CartItem, StockProblem } from '../api/types'
import { ErrorNotice, Loading, fieldLabel, primaryButton, quietButton, textInput } from '../components/ui'
import { clearCheckoutKey, currentCheckoutKey } from '../lib/checkoutKey'
import { formatPaise } from '../lib/money'
import { asApiError } from '../lib/useApi'
import { useCart } from '../state/contexts'

const ADDRESS_MAX = 500
const MAX_PER_LINE = 100

export function CartPage() {
  const { cart, setCart, refresh } = useCart()
  const [lineError, setLineError] = useState<string>()

  if (!cart) return <Loading what="your cart" />
  if (cart.items.length === 0) {
    return (
      <section>
        <h1 className="text-5xl">Your cart</h1>
        <p className="mt-6">Your cart is empty. <Link to="/" className="text-indigo underline">Browse products</Link></p>
      </section>
    )
  }

  async function change(action: () => Promise<Cart>) {
    setLineError(undefined)
    try {
      setCart(await action())
    } catch (e) {
      setLineError(asApiError(e).message)
      await refresh().catch(() => {})
    }
  }

  return (
    <section>
      <h1 className="text-5xl">Your cart</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <ErrorNotice error={lineError} />
          <ul className="border-t border-rule">
            {cart.items.map((item) => (
              <CartLine key={item.product_id} item={item}
                onQuantity={(q) => change(() => api.setCartQuantity(item.product_id, q))}
                onRemove={() => change(() => api.removeFromCart(item.product_id))} />
            ))}
          </ul>
        </div>
        <Checkout cart={cart} />
      </div>
    </section>
  )
}

function CartLine({ item, onQuantity, onRemove }: {
  item: CartItem
  onQuantity: (quantity: number) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const run = (action: () => Promise<void>) => async () => {
    setBusy(true)
    await action()
    setBusy(false)
  }
  // is_available is false for two different reasons; the numbers tell them apart.
  const unavailableReason =
    item.available_quantity >= item.quantity ? 'No longer sold. Remove it to check out.'
    : item.available_quantity === 0 ? 'Sold out. Remove it to check out.'
    : `Only ${item.available_quantity} left. Lower the quantity to check out.`

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-surface px-4 py-4">
      <div className="min-w-48 flex-1">
        <Link to={`/products/${item.product_id}`} className="font-semibold hover:text-indigo hover:underline">{item.name}</Link>
        <p className="text-sm text-slate">{item.sku} at {formatPaise(item.unit_price_paise)} each</p>
        {!item.is_available && <p className="text-sm font-semibold text-madder">{unavailableReason}</p>}
      </div>
      <div className="flex items-center gap-2" role="group" aria-label={`Quantity of ${item.name}`}>
        <button className={quietButton} aria-label="One fewer" disabled={busy || item.quantity <= 1}
          onClick={run(() => onQuantity(item.quantity - 1))}>−</button>
        <span className="w-8 text-center font-semibold tabular-nums">{item.quantity}</span>
        <button className={quietButton} aria-label="One more" disabled={busy || item.quantity >= MAX_PER_LINE}
          onClick={run(() => onQuantity(item.quantity + 1))}>+</button>
      </div>
      <p className="w-28 text-right font-semibold">{formatPaise(item.line_total_paise)}</p>
      <button className="text-sm text-slate underline hover:text-madder" disabled={busy} onClick={run(onRemove)}>
        Remove
      </button>
    </li>
  )
}

function Checkout({ cart }: { cart: Cart }) {
  const { refresh } = useCart()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [placing, setPlacing] = useState(false)
  const [problem, setProblem] = useState<ReactNode>()

  async function placeOrder(event: FormEvent) {
    event.preventDefault()
    if (!address.trim()) {
      setProblem('Enter a shipping address.')
      return
    }
    setPlacing(true)
    setProblem(undefined)
    // Same key on every retry of this checkout, so a retry after a timeout can't create a second order.
    const key = currentCheckoutKey()
    try {
      const { order } = await api.placeOrder(address.trim(), key)
      clearCheckoutKey() // done: the next checkout is a new request with a new key
      await refresh()
      navigate(`/orders?placed=${order.id}`)
    } catch (e) {
      const error = asApiError(e)
      if (error.code === 'IDEMPOTENCY_KEY_REUSED') clearCheckoutKey()
      if (!error.outcomeUnknown) await refresh().catch(() => {})
      setProblem(describeCheckoutError(error, cart))
    } finally {
      setPlacing(false)
    }
  }

  return (
    <form onSubmit={placeOrder} noValidate className="h-fit space-y-4 border border-rule bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <span>Subtotal ({cart.total_quantity} {cart.total_quantity === 1 ? 'item' : 'items'})</span>
        <span className="text-2xl font-semibold">{formatPaise(cart.subtotal_paise)}</span>
      </div>
      <div>
        <label htmlFor="address" className={fieldLabel}>Shipping address</label>
        <textarea id="address" rows={4} maxLength={ADDRESS_MAX} className={textInput} value={address}
          autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} />
      </div>
      {problem && <ErrorNotice>{problem}</ErrorNotice>}
      <button type="submit" className={`${primaryButton} w-full`} disabled={placing || cart.has_unavailable_items}>
        {placing ? 'Placing order…' : 'Place order'}
      </button>
      {cart.has_unavailable_items && (
        <p className="text-sm text-slate">Fix the items marked in red to place your order.</p>
      )}
    </form>
  )
}

function describeCheckoutError(error: ApiError, cart: Cart): ReactNode {
  switch (error.code) {
    case 'INSUFFICIENT_STOCK': {
      const names = new Map(cart.items.map((i) => [i.product_id, i.name]))
      const problems = (error.details as StockProblem[] | null) ?? []
      return (
        <>
          <p>Some items sold out while you were shopping:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p.product_id}>
                {names.get(p.product_id) ?? `Product ${p.product_id}`}:{' '}
                {p.reason === 'product_unavailable' ? 'no longer available' : `you asked for ${p.requested}, ${p.available} left`}
              </li>
            ))}
          </ul>
        </>
      )
    }
    case 'CART_EMPTY':
      return 'Your cart is empty. It may have been checked out in another tab.'
    case 'RATE_LIMITED':
      return `Too many checkout attempts. Try again in ${error.retryAfterSeconds ?? 60} seconds.`
    case 'IDEMPOTENCY_KEY_REUSED':
      return (
        <p>
          This checkout was already placed with a different address. <Link to="/orders" className="text-indigo underline">Check your orders</Link> before trying again.
        </p>
      )
    default:
      if (error.outcomeUnknown) {
        return "We couldn't confirm your order. Place it again: it's safe, and it won't create a second order."
      }
      return error.message
  }
}
