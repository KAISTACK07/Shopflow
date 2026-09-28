import { describe, expect, it } from 'vitest'
import type { Product } from '../api/types'
import { activeFilterCount, facetCounts, filterProducts, NO_FILTERS, sortProducts, toggleValue, type ProductFilters } from './filters'

function product(id: number, sku: string, price: number, stock: number, name = sku): Product {
  return {
    id, sku, name, description: '', price_paise: price, is_active: true, stock_quantity: stock,
    created_at: '2026-09-28T00:00:00Z', updated_at: '2026-09-28T00:00:00Z',
  }
}

// Server order is newest first (highest id first).
const PRODUCTS = [
  product(8, 'TOTE-CANVAS', 49_900, 0, 'Canvas tote'),
  product(7, 'JACKET-KANTHA', 499_900, 1, 'Quilted kantha jacket'),
  product(6, 'SCARF-BLOCK', 124_900, 3, 'Block-print scarf'),
  product(5, 'CAP-INDIGO', 59_900, 7, 'Indigo cap'),
  product(4, 'SOCKS-TURMERIC', 29_900, 60, 'Turmeric socks, pair'),
  product(3, 'SHIRT-KHADI', 249_900, 12, 'Khadi overshirt'),
  product(2, 'TEE-MADDER', 79_900, 18, 'Heavyweight tee, madder red'),
  product(1, 'TEE-INDIGO', 79_900, 42, 'Heavyweight tee, indigo'),
]
const skus = (list: Product[]) => list.map((p) => p.sku)
const withFilters = (changes: Partial<ProductFilters>): ProductFilters => ({ ...NO_FILTERS, ...changes })

describe('filterProducts', () => {
  it('returns everything, in server order, with no filters', () => {
    expect(filterProducts(PRODUCTS, NO_FILTERS)).toEqual(PRODUCTS)
  })

  it('filters by category', () => {
    expect(skus(filterProducts(PRODUCTS, withFilters({ category: 'Topwear' })))).toEqual(['SHIRT-KHADI', 'TEE-MADDER', 'TEE-INDIGO'])
  })

  it('hides sold-out products when "in stock only" is on', () => {
    expect(skus(filterProducts(PRODUCTS, withFilters({ inStockOnly: true })))).not.toContain('TOTE-CANVAS')
  })

  it('filters by brand, material and colour', () => {
    expect(skus(filterProducts(PRODUCTS, withFilters({ brands: ['Haldi Mill'] })))).toEqual(['TOTE-CANVAS', 'SOCKS-TURMERIC'])
    expect(skus(filterProducts(PRODUCTS, withFilters({ materials: ['Linen'] })))).toEqual(['SCARF-BLOCK'])
    // madder red appears on the madder tee, the indigo tee's second colour, the scarf and the jacket
    expect(skus(filterProducts(PRODUCTS, withFilters({ colors: ['#9e2a22'] })))).toEqual(['JACKET-KANTHA', 'SCARF-BLOCK', 'TEE-MADDER', 'TEE-INDIGO'])
  })

  it('filters by an inclusive price range in paise', () => {
    const range = withFilters({ priceMin: 59_900, priceMax: 124_900 })
    expect(skus(filterProducts(PRODUCTS, range))).toEqual(['SCARF-BLOCK', 'CAP-INDIGO', 'TEE-MADDER', 'TEE-INDIGO'])
  })

  it('shows only saved products when the wishlist filter is on', () => {
    expect(skus(filterProducts(PRODUCTS, withFilters({ savedIds: [1, 6] })))).toEqual(['SCARF-BLOCK', 'TEE-INDIGO'])
    expect(filterProducts(PRODUCTS, withFilters({ savedIds: [] }))).toEqual([])
  })

  it('combines filters (all must match)', () => {
    const combined = withFilters({ category: 'Accessories', inStockOnly: true, brands: ['Neelgar', 'Haldi Mill'] })
    expect(skus(filterProducts(PRODUCTS, combined))).toEqual(['CAP-INDIGO'])
  })
})

describe('facetCounts', () => {
  it('counts each value among products matching the other filters', () => {
    expect(facetCounts(PRODUCTS, NO_FILTERS, 'category')).toEqual(
      new Map([['Accessories', 3], ['Outerwear', 1], ['Socks', 1], ['Topwear', 3]]),
    )
  })

  it("ignores the facet's own selection, so other brands stay visible with honest counts", () => {
    const counts = facetCounts(PRODUCTS, withFilters({ brands: ['Neelgar'] }), 'brand')
    expect(counts.get('Neelgar')).toBe(3)
    expect(counts.get('Haldi Mill')).toBe(2)
  })

  it('respects the other filters', () => {
    const counts = facetCounts(PRODUCTS, withFilters({ category: 'Topwear' }), 'brand')
    expect(counts).toEqual(new Map([['Loomline', 1], ['Neelgar', 2]]))
  })
})

describe('sortProducts', () => {
  it('keeps server order for "newest"', () => {
    expect(sortProducts(PRODUCTS, 'newest')).toEqual(PRODUCTS)
  })

  it('sorts by price both ways, ties broken by id so the order is stable', () => {
    expect(skus(sortProducts(PRODUCTS, 'price-asc')).slice(0, 4)).toEqual(['SOCKS-TURMERIC', 'TOTE-CANVAS', 'CAP-INDIGO', 'TEE-INDIGO'])
    expect(skus(sortProducts(PRODUCTS, 'price-desc'))[0]).toBe('JACKET-KANTHA')
  })

  it('sorts by name', () => {
    expect(sortProducts(PRODUCTS, 'name')[0].name).toBe('Block-print scarf')
  })

  it('never mutates its input', () => {
    const before = [...PRODUCTS]
    sortProducts(PRODUCTS, 'price-asc')
    expect(PRODUCTS).toEqual(before)
  })
})

describe('helpers', () => {
  it('counts active rail filters', () => {
    const bounds = { min: 0, max: 500_000 }
    expect(activeFilterCount({ ...NO_FILTERS, priceMax: 500_000 }, bounds)).toBe(0)
    expect(activeFilterCount(withFilters({ inStockOnly: true, brands: ['A', 'B'], priceMin: 10_000, priceMax: 500_000 }), bounds)).toBe(4)
  })

  it('toggles a value in a list', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
  })
})
