import { useState } from 'react'
import { Link } from 'react-router'
import * as api from '../api/endpoints'
import type { Product } from '../api/types'
import { asApiError } from '../lib/useApi'
import { useAuth, useCart } from '../state/contexts'
import { CartIcon } from './icons'
import { ctaButton, primaryButton, quietButton } from './ui'

/**
 * Adds the product to the server-side cart. The cart re-checks stock; checkout checks it for real, under locks.
 * `beforeAdd` lets the product page validate (e.g. "choose a size") and remember display-only choices first.
 */
export function AddToCart({
  product,
  quantity = 1,
  variant = 'card',
  beforeAdd,
}: {
  product: Product
  quantity?: number
  variant?: 'card' | 'page'
  beforeAdd?: () => boolean
}) {
  const { user } = useAuth()
  const { setCart } = useCart()
  const [state, setState] = useState<'idle' | 'adding' | 'added'>('idle')
  const [error, setError] = useState<string>()
  const style = variant === 'card' ? `${ctaButton} w-full` : `${primaryButton} w-full text-base`

  if (!user) {
    return (
      <Link to={`/login?next=${encodeURIComponent(`/products/${product.id}`)}`} className={`${quietButton} w-full min-h-11`}>
        Log in to buy
      </Link>
    )
  }
  if (product.stock_quantity === 0) {
    return <button className={`${style} opacity-50`} disabled>Sold out</button>
  }

  async function add() {
    if (beforeAdd && !beforeAdd()) return
    setState('adding')
    setError(undefined)
    try {
      setCart(await api.addToCart(product.id, quantity))
      setState('added')
    } catch (e) {
      setError(asApiError(e).message)
      setState('idle')
    }
  }

  return (
    <div>
      {/* Cards repeat this button many times per page, so theirs also names the product (the visible text stays at
          the start of the accessible name, so voice control's "click Add to cart" still works). */}
      <button type="button" className={style} onClick={add} disabled={state === 'adding'}
        aria-label={variant === 'card' ? `Add to cart: ${product.name}` : undefined}>
        <CartIcon size={18} />
        {state === 'adding' ? 'Adding…' : 'Add to cart'}
      </button>
      <p className="mt-1 min-h-5 text-center text-sm" aria-live="polite">
        {state === 'added' && <Link to="/cart" className="font-semibold text-indigo underline">Added. View cart</Link>}
        {error && <span className="text-madder">{error}</span>}
      </p>
    </div>
  )
}
