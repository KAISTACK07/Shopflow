import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as api from '../api/endpoints'
import type { Product } from '../api/types'
import { ErrorNotice, Loading, Pager, StockNumber, primaryButton, quietButton, textInput } from '../components/ui'
import { formatPaise } from '../lib/money'
import { asApiError, useApi } from '../lib/useApi'
import { useAuth, useCart } from '../state/contexts'

const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 300

export function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const offset = Number(params.get('offset') ?? 0) || 0
  const [searchText, setSearchText] = useState(q)
  const products = useApi(() => api.listProducts({ q, limit: PAGE_SIZE, offset }), [q, offset])

  // Search after typing pauses, and keep it in the URL so results can be shared and survive a reload.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() !== q) setParams(searchText.trim() ? { q: searchText.trim() } : {})
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchText, q, setParams])

  return (
    <section>
      <h1 className="text-5xl">Limited runs</h1>
      <p className="mt-2 max-w-prose text-slate">
        The big number is how many are left. When it reaches zero, that item is gone.
      </p>

      <div className="mt-6 max-w-md">
        <label htmlFor="search" className="sr-only">
          Search products
        </label>
        <input id="search" type="search" className={textInput} placeholder="Search by name or SKU"
          value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </div>

      <div className="mt-6">
        {products.error && <ErrorNotice error={products.error} />}
        {products.loading && !products.data && <Loading what="products" />}
        {products.data && products.data.items.length === 0 && (
          <p className="py-8">
            {q ? <>No products match “{q}”. <button className="text-indigo underline" onClick={() => setSearchText('')}>Clear the search</button></>
               : 'Nothing for sale yet. Check back soon.'}
          </p>
        )}
        {products.data && products.data.items.length > 0 && (
          <>
            <ul className="border-t border-rule">
              {products.data.items.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </ul>
            <Pager total={products.data.total} limit={PAGE_SIZE} offset={offset}
              onChange={(next) => setParams({ ...(q ? { q } : {}), offset: String(next) })} />
          </>
        )}
      </div>
    </section>
  )
}

function ProductRow({ product }: { product: Product }) {
  return (
    <li className="grid grid-cols-[5rem_1fr] items-center gap-x-6 gap-y-3 border-b border-rule bg-surface px-4 py-5 sm:grid-cols-[5rem_1fr_auto_11rem]">
      <StockNumber quantity={product.stock_quantity} />
      <div className="min-w-0">
        <Link to={`/products/${product.id}`} className="text-xl font-semibold hover:text-indigo hover:underline">
          {product.name}
        </Link>
        <p className="text-sm text-slate">{product.sku}</p>
        {product.description && <p className="mt-1 line-clamp-2 max-w-prose text-sm">{product.description}</p>}
      </div>
      <p className="col-start-2 text-lg font-semibold sm:col-start-auto">{formatPaise(product.price_paise)}</p>
      <div className="col-start-2 sm:col-start-auto">
        <AddToCart product={product} quantity={1} />
      </div>
    </li>
  )
}

/** Shared by the list and the detail page. The cart re-checks stock; checkout checks it for real. */
export function AddToCart({ product, quantity }: { product: Product; quantity: number }) {
  const { user } = useAuth()
  const { setCart } = useCart()
  const [state, setState] = useState<'idle' | 'adding' | 'added'>('idle')
  const [error, setError] = useState<string>()

  if (!user) {
    return (
      <Link to={`/login?next=${encodeURIComponent(`/products/${product.id}`)}`} className={`${quietButton} w-full`}>
        Log in to buy
      </Link>
    )
  }
  if (product.stock_quantity === 0) {
    return <button className={`${quietButton} w-full`} disabled>Sold out</button>
  }

  async function add() {
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
      <button className={`${primaryButton} w-full`} onClick={add} disabled={state === 'adding'}>
        {state === 'adding' ? 'Adding…' : 'Add to cart'}
      </button>
      <p className="mt-1 min-h-5 text-sm" aria-live="polite">
        {state === 'added' && <Link to="/cart" className="text-indigo underline">Added. View cart</Link>}
        {error && <span className="text-madder">{error}</span>}
      </p>
    </div>
  )
}
