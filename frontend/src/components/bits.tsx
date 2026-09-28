// Small presentational pieces: rating, skeletons, wishlist heart, colour dots, trust badges.

import type { Product } from '../api/types'
import { useWishlist } from '../state/contexts'
import { HandIcon, HeartIcon, ReturnIcon, StarIcon, TruckIcon } from './icons'

/** ★ 4.6 (128). Ratings are presentation-layer demo values (see catalog.ts). */
export function Rating({ rating, reviews }: { rating: number; reviews: number }) {
  if (reviews === 0) return null
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={`Rated ${rating.toFixed(1)} out of 5, ${reviews} reviews`}>
      <StarIcon size={15} className="text-turmeric" />
      <span className="font-bold" aria-hidden="true">{rating.toFixed(1)}</span>
      <span className="text-slate" aria-hidden="true">({reviews})</span>
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-control ${className}`} aria-hidden="true" />
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-2.5 shadow-card" aria-hidden="true">
      <Skeleton className="aspect-[3/4] w-full" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-11 w-full" />
    </div>
  )
}

export function WishlistButton({ product, className = '' }: { product: Pick<Product, 'id' | 'name'>; className?: string }) {
  const wishlist = useWishlist()
  const saved = wishlist.has(product.id)
  return (
    <button
      type="button"
      onClick={() => wishlist.toggle(product.id)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className={`grid size-10 place-items-center rounded-pill bg-surface/90 shadow-card backdrop-blur transition active:scale-90 ${saved ? 'text-madder' : 'text-ink hover:text-madder'} ${className}`}
    >
      <HeartIcon filled={saved} size={19} />
    </button>
  )
}

export function ColorDots({ colors, names }: { colors: string[]; names: string[] }) {
  return (
    <span className="flex gap-1.5" aria-label={`Colours: ${names.join(', ')}`} role="img">
      {colors.map((hex, i) => (
        <span key={hex} title={names[i]} className="size-3.5 rounded-pill border border-rule" style={{ background: hex }} />
      ))}
    </span>
  )
}

const TRUST_POINTS = [
  { icon: TruckIcon, title: 'Free shipping', detail: 'On orders over ₹999' },
  { icon: ReturnIcon, title: 'Easy returns', detail: 'Within 7 days' },
  { icon: HandIcon, title: 'Handcrafted', detail: 'In small batches' },
] as const

export function TrustBadges({ compact = false }: { compact?: boolean }) {
  return (
    // compact: narrow places (cart summary, product page), where three columns would squeeze the text.
    <ul className={`grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-3'}`}>
      {TRUST_POINTS.map(({ icon: Icon, title, detail }) => (
        <li key={title} className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-plenty-bg text-plenty-fg">
            <Icon size={19} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold">{title}</span>
            <span className="text-sm text-slate">{detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
