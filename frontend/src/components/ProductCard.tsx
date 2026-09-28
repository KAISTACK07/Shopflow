import { Link } from 'react-router'
import type { Product } from '../api/types'
import { catalogFor } from '../lib/catalog'
import { formatPaise } from '../lib/money'
import { AddToCart } from './AddToCart'
import { ColorDots, Rating, WishlistButton } from './bits'
import { StockBadge } from './ui'

/** One product in the grid (or a row in list view). Real fields come from the API; the rest from catalog.ts. */
export function ProductCard({ product, layout = 'grid' }: { product: Product; layout?: 'grid' | 'list' }) {
  const entry = catalogFor(product.sku)
  const soldOut = product.stock_quantity === 0
  const href = `/products/${product.id}`

  const image = (
    <div className={`relative overflow-hidden rounded-[10px] bg-surface-2 ${layout === 'list' ? 'aspect-[3/4] w-32 shrink-0 sm:w-40' : 'aspect-[3/4]'}`}>
      {/* The name link below is the one keyboard stop; this image link is a mouse/touch shortcut to the same page. */}
      <Link to={href} tabIndex={-1} aria-hidden="true">
        <img src={entry.imageUrl} alt="" loading="lazy"
          className={`h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] ${soldOut ? 'opacity-70 grayscale-[.6]' : ''}`} />
      </Link>
      <StockBadge quantity={product.stock_quantity} className="absolute top-2 left-2 shadow-card" />
      <WishlistButton product={product} className="absolute top-2 right-2" />
    </div>
  )

  const details = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <ColorDots colors={entry.colors} names={entry.colorNames} />
      <span className="mt-1 text-xs font-semibold tracking-wide text-slate">{entry.brand}</span>
      <Link to={href} className="font-semibold leading-snug hover:text-indigo">{product.name}</Link>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
        <span className="text-lg font-extrabold tabular-nums">{formatPaise(product.price_paise)}</span>
        <Rating rating={entry.rating} reviews={entry.reviews} />
      </div>
    </div>
  )

  if (layout === 'list') {
    return (
      <article className="group flex gap-4 rounded-card border border-rule bg-surface p-3 shadow-card">
        {image}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {details}
          <p className="line-clamp-2 text-sm text-ink-soft">{product.description}</p>
          <div className="max-w-60"><AddToCart product={product} /></div>
        </div>
      </article>
    )
  }
  return (
    <article className="group flex flex-col gap-3 rounded-card border border-rule bg-surface p-2.5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      {image}
      <div className="flex flex-1 flex-col gap-3 px-1">
        {details}
        <AddToCart product={product} />
      </div>
    </article>
  )
}
