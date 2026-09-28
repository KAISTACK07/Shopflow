import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ApiError } from '../api/client'
import * as api from '../api/endpoints'
import type { Cart, CartItem, StockProblem } from '../api/types'
import { Skeleton, TrustBadges } from '../components/bits'
import { ArrowRight, BagIcon, TrashIcon } from '../components/icons'
import { ErrorNotice, card, ctaButton, fieldLabel, textInput } from '../components/ui'
import { catalogFor } from '../lib/catalog'
import { clearCheckoutKey, currentCheckoutKey } from '../lib/checkoutKey'
import { formatPaise } from '../lib/money'
import { addressWithSizes, SHIPPING_ADDRESS_MAX, sizeFor } from '../lib/sizes'
import { asApiError } from '../lib/useApi'
import { useCart } from '../state/contexts'

const MAX_PER_LINE = 100
// Room left in the backend's 500-character shipping_address for the "Items: … (size)" note.
const ADDRESS_INPUT_MAX = SHIPPING_ADDRESS_MAX - 120

/** Size chosen on the product page (display-only), for products that come in sizes. */
const displaySize = (item: CartItem) => (catalogFor(item.sku).sizes.length > 1 ? sizeFor(item.product_id) : undefined)

export function CartPage() {
  const { cart, setCart, refresh } = useCart()
  const [lineError, setLineError] = useState<string>()

  if (!cart) return <CartSkeleton />
  if (cart.items.length === 0) {
    return (
      <section className={`${card} mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-12 text-center`}>
        <span className="grid size-16 place-items-center rounded-pill bg-plenty-bg text-plenty-fg"><BagIcon size={28} /></span>
        <h1 className="text-4xl">Your cart is empty</h1>
        <p className="text-slate">Pieces sell out fast. Add something before it's gone.</p>
        <Link to="/?category=All" className={ctaButton}>Browse the collection <ArrowRight size={18} /></Link>
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
    <section className="flex flex-col gap-6">
      <h1 className="text-4xl sm:text-5xl">Your Cart ({cart.total_quantity})</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-3">
          <ErrorNotice error={lineError} />
          <ul className="flex flex-col gap-3">
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
  const entry = catalogFor(item.sku)
  const size = displaySize(item)
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
    <li className={`${card} flex gap-4 p-3 ${item.is_available ? '' : 'border-out-bg'}`}>
      <Link to={`/products/${item.product_id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <img src={entry.imageUrl} alt="" className="h-28 w-22 rounded-[10px] object-cover sm:h-32 sm:w-24" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate">{entry.brand}</p>
            <Link to={`/products/${item.product_id}`} className="font-semibold leading-snug hover:text-indigo">{item.name}</Link>
            <p className="text-sm text-slate">
              {size && <>Size {size} · </>}{formatPaise(item.unit_price_paise)} each
            </p>
          </div>
          <button type="button" onClick={run(onRemove)} disabled={busy} aria-label={`Remove ${item.name}`}
            className="grid size-10 shrink-0 place-items-center rounded-pill text-slate transition hover:bg-out-bg hover:text-madder">
            <TrashIcon size={18} />
          </button>
        </div>
        {!item.is_available && <p className="text-sm font-semibold text-madder">{unavailableReason}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div className="inline-flex items-center rounded-control border border-rule" role="group" aria-label={`Quantity of ${item.name}`}>
            <button type="button" aria-label="One fewer" disabled={busy || item.quantity <= 1} onClick={run(() => onQuantity(item.quantity - 1))}
              className="grid size-10 place-items-center text-lg font-bold disabled:opacity-35">−</button>
            <span className="w-8 text-center font-extrabold tabular-nums">{item.quantity}</span>
            <button type="button" aria-label="One more" disabled={busy || item.quantity >= MAX_PER_LINE} onClick={run(() => onQuantity(item.quantity + 1))}
              className="grid size-10 place-items-center text-lg font-bold disabled:opacity-35">+</button>
          </div>
          <p className="text-lg font-extrabold tabular-nums">{formatPaise(item.line_total_paise)}</p>
        </div>
      </div>
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
    // Chosen sizes are display-only, so they travel as a note inside the shipping address text.
    const shippingAddress = addressWithSizes(address, cart.items.map((item) => ({
      label: `${catalogFor(item.sku).brand} ${item.name}`,
      size: displaySize(item),
    })))
    // Same key on every retry of this checkout, so a retry after a timeout can't create a second order.
    const key = currentCheckoutKey()
    try {
      const { order, replayed } = await api.placeOrder(shippingAddress, key)
      clearCheckoutKey() // done: the next checkout is a new request with a new key
      await refresh()
      navigate(`/orders?placed=${order.id}${replayed ? '&replayed=1' : ''}`)
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
    <form onSubmit={placeOrder} noValidate className={`${card} flex h-fit flex-col gap-4 p-5 lg:sticky lg:top-24`}>
      <h2 className="text-2xl">Order summary</h2>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between"><dt className="text-slate">Subtotal ({cart.total_quantity} {cart.total_quantity === 1 ? 'item' : 'items'})</dt><dd className="font-semibold tabular-nums">{formatPaise(cart.subtotal_paise)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate">Shipping</dt><dd className="font-semibold text-indigo">Free</dd></div>
        <div className="flex justify-between border-t border-rule pt-3 text-lg"><dt className="font-bold">Total</dt><dd className="font-extrabold tabular-nums">{formatPaise(cart.subtotal_paise)}</dd></div>
      </dl>
      <div>
        <label htmlFor="address" className={fieldLabel}>Shipping address</label>
        <textarea id="address" rows={4} maxLength={ADDRESS_INPUT_MAX} className={textInput} value={address}
          autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} placeholder="House, street, city, PIN code" />
      </div>
      {problem && <ErrorNotice>{problem}</ErrorNotice>}
      <button type="submit" className={`${ctaButton} w-full text-base`} disabled={placing || cart.has_unavailable_items}>
        {placing ? 'Placing order…' : <>Checkout <ArrowRight size={18} /></>}
      </button>
      {cart.has_unavailable_items && <p className="text-sm text-slate">Fix the items marked in red to place your order.</p>}
      <div className="border-t border-rule pt-4"><TrustBadges compact /></div>
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

function CartSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]" role="status" aria-label="Loading your cart">
      <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-36 w-full rounded-card" />)}</div>
      <Skeleton className="h-80 w-full rounded-card" />
    </div>
  )
}
