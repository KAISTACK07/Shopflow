// Client-side filtering and sorting. The API only supports q, limit and offset, so the page of products it returns
// is filtered here using the presentation layer (catalog.ts). Nothing in this file talks to the API.

import type { Product } from '../api/types'
import { catalogFor, type Category, type CatalogEntry } from './catalog'

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A to Z' },
]

export function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value)
}

export interface ProductFilters {
  category: Category | 'All'
  inStockOnly: boolean
  brands: string[]
  materials: string[]
  colors: string[] // hex
  priceMin: number // paise
  priceMax: number // paise
  savedIds: number[] | null // wishlist filter: null = off
}

export const NO_FILTERS: ProductFilters = {
  category: 'All',
  inStockOnly: false,
  brands: [],
  materials: [],
  colors: [],
  priceMin: 0,
  priceMax: Number.POSITIVE_INFINITY,
  savedIds: null,
}

type Lookup = (sku: string) => CatalogEntry
type Facet = 'category' | 'brand' | 'material'

/** Every product that passes all filters, in the original (server) order. */
export function filterProducts(products: readonly Product[], filters: ProductFilters, lookup: Lookup = catalogFor): Product[] {
  return products.filter((product) => passes(product, filters, lookup))
}

function passes(product: Product, f: ProductFilters, lookup: Lookup, ignore?: Facet): boolean {
  const entry = lookup(product.sku)
  return (
    (ignore === 'category' || f.category === 'All' || entry.category === f.category) &&
    (ignore === 'brand' || f.brands.length === 0 || f.brands.includes(entry.brand)) &&
    (ignore === 'material' || f.materials.length === 0 || f.materials.includes(entry.material)) &&
    (f.colors.length === 0 || entry.colors.some((c) => f.colors.includes(c))) &&
    (!f.inStockOnly || product.stock_quantity > 0) &&
    product.price_paise >= f.priceMin &&
    product.price_paise <= f.priceMax &&
    (f.savedIds === null || f.savedIds.includes(product.id))
  )
}

/**
 * How many products each value of a facet would show, given all the *other* filters. Ignoring the facet's own
 * selection is what lets "Brand: Neelgar (3)" stay visible and accurate while another brand is ticked.
 */
export function facetCounts(
  products: readonly Product[],
  filters: ProductFilters,
  facet: Facet,
  lookup: Lookup = catalogFor,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const product of products) {
    if (!passes(product, filters, lookup, facet)) continue
    const entry = lookup(product.sku)
    const value = facet === 'category' ? entry.category : facet === 'brand' ? entry.brand : entry.material
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/** A sorted copy. "Newest" keeps the server's order (newest first); the input is never mutated. */
export function sortProducts(products: readonly Product[], key: SortKey): Product[] {
  const copy = [...products]
  switch (key) {
    case 'newest':
      return copy
    case 'price-asc':
      return copy.sort((a, b) => a.price_paise - b.price_paise || a.id - b.id)
    case 'price-desc':
      return copy.sort((a, b) => b.price_paise - a.price_paise || a.id - b.id)
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
  }
}

/** Number of rail filters in use (for the "Filters (3)" button on phones). Category and wishlist live in the URL. */
export function activeFilterCount(f: ProductFilters, bounds: { min: number; max: number }): number {
  return (
    (f.inStockOnly ? 1 : 0) +
    f.brands.length +
    f.materials.length +
    f.colors.length +
    (f.priceMin > bounds.min || f.priceMax < bounds.max ? 1 : 0)
  )
}

export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}
