import { useState } from 'react'
import { Link, useParams } from 'react-router'
import * as api from '../api/endpoints'
import type { Product } from '../api/types'
import { AddToCart } from '../components/AddToCart'
import { ProductCardSkeleton, Rating, Skeleton, TrustBadges, WishlistButton } from '../components/bits'
import { ProductCard } from '../components/ProductCard'
import { ErrorNotice, StockBadge } from '../components/ui'
import type { ArtView } from '../lib/art'
import { catalogFor, productImage } from '../lib/catalog'
import { formatPaise } from '../lib/money'
import { saveSize, sizeFor } from '../lib/sizes'
import { useApi } from '../lib/useApi'

const MAX_PER_LINE = 100 // same cap as the backend's cart line limit
const VIEWS: { view: ArtView; label: string }[] = [
  { view: 'front', label: 'Front' },
  { view: 'detail', label: 'Close-up' },
  { view: 'fabric', label: 'Fabric' },
]

export function ProductPage() {
  const id = Number(useParams().id)
  const product = useApi(() => api.getProduct(id), [id])

  if (product.error) {
    return (
      <ErrorNotice error={product.error.code === 'PRODUCT_NOT_FOUND' ? 'This product isn’t for sale any more.' : product.error}>
        <Link to="/?category=All" className="font-semibold text-indigo underline">Browse the collection</Link>
      </ErrorNotice>
    )
  }
  if (!product.data) return <ProductSkeleton />
  // Keyed by id: choosing another product starts fresh (colour, size, quantity) without effects to reset state.
  return <ProductDetail key={product.data.id} product={product.data} />
}

function ProductDetail({ product }: { product: Product }) {
  const entry = catalogFor(product.sku)
  const needsSize = entry.sizes.length > 1
  const [color, setColor] = useState(entry.colors[0])
  const [view, setView] = useState<ArtView>('front')
  const [size, setSize] = useState<string | undefined>(() => {
    const remembered = sizeFor(product.id)
    return remembered && entry.sizes.includes(remembered) ? remembered : undefined
  })
  const [sizeError, setSizeError] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const max = Math.max(1, Math.min(MAX_PER_LINE, product.stock_quantity))
  const colorName = entry.colorNames[entry.colors.indexOf(color)] ?? ''

  function beforeAdd(): boolean {
    if (needsSize && !size) {
      setSizeError(true)
      document.getElementById('size-options')?.focus()
      return false
    }
    if (size) saveSize(product.id, size) // display-only: shown in the bag and added to the shipping note
    return true
  }

  return (
    <div className="flex flex-col gap-12">
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate">
        <Link to="/" className="hover:text-indigo">Home</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/?category=${entry.category}`} className="hover:text-indigo">{entry.category}</Link> <span aria-hidden="true">/</span>{' '}
        <span aria-current="page" className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="flex flex-col-reverse gap-3 self-start sm:flex-row sm:items-start">
          <div className="flex gap-3 sm:flex-col" role="group" aria-label="Photos">
            {VIEWS.map(({ view: v, label }) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-label={`Show ${label.toLowerCase()} view`} aria-current={view === v}
                className={`aspect-[3/4] w-20 overflow-hidden rounded-[10px] border-2 transition ${view === v ? 'border-indigo shadow-card' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                <img src={productImage(product.sku, { color, view: v })} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <div className="relative flex-1 overflow-hidden rounded-hero border border-rule bg-surface-2">
            <img src={productImage(product.sku, { color, view })} alt={`${product.name}, ${colorName}, ${view} view`} className="aspect-[3/4] w-full object-cover" />
            <WishlistButton product={product} className="absolute top-4 right-4 size-11" />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <StockBadge quantity={product.stock_quantity} />
            <span className="inline-flex items-center rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink">Limited run</span>
          </div>
          <div>
            <p className="font-semibold text-slate">{entry.brand}</p>
            <h1 className="mt-1 text-4xl sm:text-5xl">{product.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-numeral text-4xl">{formatPaise(product.price_paise)}</span>
            <Rating rating={entry.rating} reviews={entry.reviews} />
          </div>
          {product.description && <p className="max-w-prose text-lg text-ink-soft">{product.description}</p>}

          {entry.colors.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-bold">Colour: <span className="font-semibold text-ink-soft">{colorName}</span></legend>
              <div className="flex flex-wrap gap-3">
                {entry.colors.map((hex, i) => (
                  <button key={hex} type="button" onClick={() => setColor(hex)} aria-pressed={color === hex} aria-label={entry.colorNames[i]} title={entry.colorNames[i]}
                    className={`size-10 rounded-pill border-2 transition active:scale-90 ${color === hex ? 'border-indigo ring-2 ring-indigo ring-offset-2 ring-offset-page' : 'border-rule'}`}
                    style={{ background: hex }} />
                ))}
              </div>
            </fieldset>
          )}

          {needsSize && (
            <fieldset>
              <div className="mb-2 flex items-baseline justify-between">
                <legend className="font-bold">Size{size ? `: ${size}` : ''}</legend>
                <button type="button" aria-disabled="true" title="Coming soon" className="cursor-not-allowed text-sm font-semibold text-slate/70">
                  Size guide<span className="sr-only"> (coming soon)</span>
                </button>
              </div>
              <div id="size-options" tabIndex={-1} className="flex flex-wrap gap-2" role="group" aria-describedby={sizeError ? 'size-error' : undefined}>
                {entry.sizes.map((s) => (
                  <button key={s} type="button" aria-pressed={size === s} onClick={() => { setSize(s); setSizeError(false) }}
                    className={`min-h-11 min-w-12 rounded-control border-2 px-3 font-bold transition active:scale-95 ${size === s ? 'border-indigo bg-plenty-bg text-plenty-fg' : 'border-rule bg-surface hover:border-indigo'}`}>
                    {s}
                  </button>
                ))}
              </div>
              {sizeError && <p id="size-error" role="alert" className="mt-2 text-sm font-semibold text-madder">Choose a size to add this to your cart.</p>}
            </fieldset>
          )}

          {product.stock_quantity > 0 && (
            <div>
              <span className="mb-2 block font-bold" id="qty-label">Quantity</span>
              <div className="inline-flex items-center rounded-control border border-rule bg-surface" role="group" aria-labelledby="qty-label">
                <button type="button" aria-label="One fewer" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}
                  className="grid size-11 place-items-center text-xl font-bold disabled:opacity-35">−</button>
                <output className="w-10 text-center font-extrabold tabular-nums" aria-live="polite">{quantity}</output>
                <button type="button" aria-label="One more" disabled={quantity >= max} onClick={() => setQuantity(quantity + 1)}
                  className="grid size-11 place-items-center text-xl font-bold disabled:opacity-35">+</button>
              </div>
            </div>
          )}

          <div className="max-w-md">
            <AddToCart product={product} quantity={quantity} variant="page" beforeAdd={beforeAdd} />
          </div>
          <div className="rounded-card border border-rule bg-surface p-4 shadow-card"><TrustBadges compact /></div>
          <p className="text-sm text-slate">SKU {product.sku} · {entry.material}</p>
        </div>
      </div>

      <Related product={product} />
    </div>
  )
}

function Related({ product }: { product: Product }) {
  const category = catalogFor(product.sku).category
  const list = useApi(() => api.listProducts({ limit: 50 }), [])
  const related = (list.data?.items ?? []).filter((p) => p.id !== product.id && catalogFor(p.sku).category === category).slice(0, 4)
  if (list.data && related.length === 0) return null
  return (
    <section aria-labelledby="related-title">
      <h2 id="related-title" className="mb-4 text-3xl">More {category.toLowerCase()}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {list.data
          ? related.map((p) => <li key={p.id}><ProductCard product={p} /></li>)
          : Array.from({ length: 4 }, (_, i) => <li key={i}><ProductCardSkeleton /></li>)}
      </ul>
    </section>
  )
}

function ProductSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12" role="status" aria-label="Loading product">
      <Skeleton className="aspect-[3/4] w-full rounded-hero" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-12 w-4/5" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full max-w-md" />
      </div>
    </div>
  )
}
