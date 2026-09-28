import { describe, expect, it } from 'vitest'
import { brands, CATALOG, catalogFor, categories, colors, FALLBACK, isCategory, materials, priceBounds, productImage } from './catalog'

const SEEDED_SKUS = ['TEE-INDIGO', 'TEE-MADDER', 'SHIRT-KHADI', 'SOCKS-TURMERIC', 'CAP-INDIGO', 'SCARF-BLOCK', 'JACKET-KANTHA', 'TOTE-CANVAS']

describe('catalog', () => {
  it('has an entry for every seeded demo product', () => {
    expect(Object.keys(CATALOG).sort()).toEqual([...SEEDED_SKUS].sort())
  })

  it.each(SEEDED_SKUS)('%s renders offline and is internally consistent', (sku) => {
    const entry = CATALOG[sku]
    expect(entry.imageUrl.startsWith('data:image/svg+xml')).toBe(true) // no network needed
    expect(categories()).toContain(entry.category)
    expect(entry.colors.length).toBe(entry.colorNames.length)
    expect(entry.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true)
    expect(entry.sizes.length).toBeGreaterThan(0)
    expect(entry.rating).toBeGreaterThanOrEqual(0)
    expect(entry.rating).toBeLessThanOrEqual(5)
  })

  it('falls back to a generic entry for products added after the seed', () => {
    expect(catalogFor('NEW-THING')).toBe(FALLBACK)
    expect(catalogFor('TEE-INDIGO')).toBe(CATALOG['TEE-INDIGO'])
  })

  it('derives facets from the entries', () => {
    expect(brands()).toEqual(['Bagru Press', 'Haldi Mill', 'Kantha Works', 'Loomline', 'Neelgar'])
    expect(materials()).toEqual(['Cotton', 'Linen'])
    expect(categories()).toEqual(['Topwear', 'Socks', 'Accessories', 'Outerwear'])
    const hexes = colors().map((c) => c.hex)
    expect(new Set(hexes).size).toBe(hexes.length) // each colour once
    expect(colors()).toContainEqual({ hex: '#2e3f8f', name: 'Indigo' })
  })

  it('recolours images for swatches without touching the default image', () => {
    const indigo = productImage('TEE-INDIGO')
    const madder = productImage('TEE-INDIGO', { color: '#9e2a22' })
    expect(indigo).toBe(CATALOG['TEE-INDIGO'].imageUrl)
    expect(madder).not.toBe(indigo)
    expect(decodeURIComponent(madder)).toContain('#9e2a22')
  })

  it('recognises category names', () => {
    expect(isCategory('Socks')).toBe(true)
    expect(isCategory('socks')).toBe(false)
    expect(isCategory(null)).toBe(false)
  })
})

describe('priceBounds', () => {
  it('always reaches at least ₹5,000', () => {
    expect(priceBounds([])).toEqual({ min: 0, max: 500_000 })
    expect(priceBounds([{ price_paise: 29_900 }])).toEqual({ min: 0, max: 500_000 })
  })

  it('rounds a higher price up to a whole ₹500', () => {
    expect(priceBounds([{ price_paise: 612_300 }])).toEqual({ min: 0, max: 650_000 })
  })
})
