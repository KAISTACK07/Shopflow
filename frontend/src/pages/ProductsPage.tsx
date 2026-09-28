import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as api from '../api/endpoints'
import type { Page, Product } from '../api/types'
import { ProductCardSkeleton } from '../components/bits'
import { CategoryCards, CategoryChips, SortSelect, ViewToggle } from '../components/CatalogControls'
import { Drawer } from '../components/Drawer'
import { FilterRail } from '../components/FilterRail'
import { Hero, TrustStrip } from '../components/Hero'
import { FilterIcon } from '../components/icons'
import { ProductCard } from '../components/ProductCard'
import { ErrorNotice, Pager, ctaButton, quietButton } from '../components/ui'
import type { ApiError } from '../api/client'
import { CATEGORY_INFO, isCategory, priceBounds, type Category } from '../lib/catalog'
import { activeFilterCount, filterProducts, isSortKey, NO_FILTERS, sortProducts, type ProductFilters, type SortKey } from '../lib/filters'
import { useApi } from '../lib/useApi'
import { useWishlist } from '../state/contexts'

const PAGE_SIZE = 20

/**
 * "/" is the home page; with ?category=, ?q= or ?saved=1 it becomes the listing. The server does search (q) and
 * pagination; category, filters and sorting run in the browser over the fetched page (see lib/filters.ts).
 */
export function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const offset = Number(params.get('offset') ?? 0) || 0
  const products = useApi(() => api.listProducts({ q, limit: PAGE_SIZE, offset }), [q, offset])
  const listing = params.has('category') || params.has('q') || params.has('saved')

  return listing ? (
    <Listing products={products.data} error={products.error} loading={products.loading} params={params} setParams={setParams} offset={offset} />
  ) : (
    <Home products={products.data?.items} error={products.error} />
  )
}

function ProductGrid({ products, layout = 'grid', columns = 'wide' }: { products: Product[]; layout?: 'grid' | 'list'; columns?: 'wide' | 'rail' }) {
  if (layout === 'list') {
    return <ul className="flex flex-col gap-4">{products.map((p) => <li key={p.id}><ProductCard product={p} layout="list" /></li>)}</ul>
  }
  const cols = columns === 'wide' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'
  return <ul className={`grid gap-3 sm:gap-5 ${cols}`}>{products.map((p) => <li key={p.id} className="flex"><div className="w-full"><ProductCard product={p} /></div></li>)}</ul>
}

function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  )
}

// --- home ------------------------------------------------------------------------------------------------------

function Home({ products, error }: { products?: Product[]; error?: ApiError }) {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <Hero />
      <TrustStrip />
      <section aria-labelledby="shop-by-category">
        <h2 id="shop-by-category" className="mb-4 text-3xl">Shop by category</h2>
        <CategoryCards products={products ?? []} />
      </section>
      <section aria-labelledby="featured">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="featured" className="text-3xl">Featured products</h2>
          <Link to="/?category=All" className="font-semibold text-indigo hover:underline">View all →</Link>
        </div>
        {error && <ErrorNotice error={error} />}
        {!products && !error && <SkeletonGrid />}
        {products && products.length === 0 && <p className="py-8 text-slate">Nothing for sale yet. Check back soon.</p>}
        {products && products.length > 0 && <ProductGrid products={products.slice(0, 8)} />}
      </section>
    </div>
  )
}

// --- listing ---------------------------------------------------------------------------------------------------

type RailState = Omit<ProductFilters, 'category' | 'savedIds'>
const EMPTY_RAIL: RailState = {
  inStockOnly: NO_FILTERS.inStockOnly, brands: [], materials: [], colors: [],
  priceMin: 0, priceMax: Number.POSITIVE_INFINITY,
}

function Listing({ products, error, loading, params, setParams, offset }: {
  products?: Page<Product>
  error?: ApiError
  loading: boolean
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
  offset: number
}) {
  const wishlist = useWishlist()
  const [rail, setRail] = useState<RailState>(EMPTY_RAIL)
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const categoryParam = params.get('category')
  const category: Category | 'All' = isCategory(categoryParam) ? categoryParam : 'All'
  const sort: SortKey = isSortKey(params.get('sort')) ? (params.get('sort') as SortKey) : 'newest'
  const saved = params.get('saved') === '1'
  const q = params.get('q') ?? ''

  const items = useMemo(() => products?.items ?? [], [products])
  const bounds = useMemo(() => priceBounds(items), [items])
  const filters: ProductFilters = { ...rail, category, savedIds: saved ? wishlist.ids : null }
  const visible = sortProducts(filterProducts(items, filters), sort)
  const activeCount = activeFilterCount({ ...filters, priceMax: Math.min(rail.priceMax, bounds.max) }, bounds)

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next)
  }
  const setCategory = (c: Category | 'All') => update({ category: c, saved: null })
  const clearAll = () => setRail(EMPTY_RAIL)

  const info = CATEGORY_INFO[category]
  const title = saved ? 'Your wishlist' : q ? `Results for “${q}”` : info.title
  const tagline = saved ? 'Pieces you saved in this browser.' : q ? `Searching names, brands and SKUs in ${category === 'All' ? 'every category' : category}.` : info.tagline

  const rails = (
    <FilterRail products={items} filters={filters} bounds={bounds} onCategory={setCategory}
      onChange={(changes) => setRail((current) => ({ ...current, ...changes }))} onClear={clearAll} />
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-hero border border-rule bg-holo px-6 py-7 sm:px-8" aria-labelledby="listing-title">
        <p className="text-sm font-semibold text-slate">
          <Link to="/" className="hover:text-indigo">Home</Link> <span aria-hidden="true">/</span> {saved ? 'Wishlist' : category}
        </p>
        <h1 id="listing-title" className="mt-1 text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-xl text-ink-soft">{tagline}</p>
      </section>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-24 rounded-card border border-rule bg-surface p-5 shadow-card">{rails}</div>
        </aside>

        <section aria-labelledby="results-count" className="min-w-0">
          <div className="lg:hidden"><CategoryChips active={category} onSelect={setCategory} /></div>
          <div className="my-4 flex flex-wrap items-center justify-between gap-3">
            <p id="results-count" className="font-semibold text-slate" aria-live="polite">
              {loading && !products ? 'Loading…' : `${visible.length} ${visible.length === 1 ? 'product' : 'products'}`}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDrawerOpen(true)} className={`${quietButton} lg:hidden`}>
                <FilterIcon size={17} /> Filters{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
              <SortSelect value={sort} onChange={(value) => update({ sort: value === 'newest' ? null : value })} />
              <ViewToggle value={layout} onChange={setLayout} />
            </div>
          </div>

          {error && <ErrorNotice error={error} />}
          {!products && !error && <SkeletonGrid count={6} />}
          {products && visible.length > 0 && <ProductGrid products={visible} layout={layout} columns="rail" />}
          {products && visible.length === 0 && (
            <div className="flex flex-col items-start gap-3 rounded-card border border-rule bg-surface p-8 shadow-card">
              <h2 className="text-2xl">{saved && wishlist.ids.length === 0 ? 'Your wishlist is empty' : 'No pieces match'}</h2>
              <p className="text-slate">
                {saved && wishlist.ids.length === 0 ? 'Tap the heart on any piece to save it here.' : 'Try another category, or clear the filters.'}
              </p>
              {saved && wishlist.ids.length === 0
                ? <Link to="/?category=All" className={ctaButton}>Browse the collection</Link>
                : <button type="button" onClick={() => { clearAll(); setCategory('All') }} className={quietButton}>Clear filters</button>}
            </div>
          )}
          {products && products.total > PAGE_SIZE && (
            <p className="mt-4 text-sm text-slate">Filters and sorting apply to the products on this page.</p>
          )}
          {products && (
            <Pager total={products.total} limit={PAGE_SIZE} offset={offset} onChange={(next) => update({ offset: next ? String(next) : null })} />
          )}
        </section>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters" side="bottom"
        footer={<button type="button" onClick={() => setDrawerOpen(false)} className={`${ctaButton} w-full`}>Show {visible.length} {visible.length === 1 ? 'product' : 'products'}</button>}>
        {rails}
      </Drawer>
    </div>
  )
}
