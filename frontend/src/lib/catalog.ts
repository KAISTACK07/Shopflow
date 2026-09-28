// Presentation layer, keyed by SKU. None of this exists in the backend and none of it is ever sent to the API:
// the real product fields are id, sku, name, description, price_paise, is_active and stock_quantity.
// Brand, category, material, colours, sizes and imagery describe how the demo shop *looks*. Ratings and review
// counts are illustrative demo values for the storefront design; there is no review system behind them.

import { garmentImage, recolor, type ArtSpec, type ArtView } from './art'

export type Category = 'Topwear' | 'Socks' | 'Accessories' | 'Outerwear'
export type Material = 'Cotton' | 'Linen' | 'Wool'

export interface CatalogEntry {
  imageUrl: string
  brand: string
  category: Category
  material: Material
  colors: string[] // hex, first one is the pictured colour
  colorNames: string[] // same order as colors
  sizes: string[] // one entry ("One size") means there is nothing to choose
  rating: number
  reviews: number
  art: ArtSpec
}

type Seed = Omit<CatalogEntry, 'imageUrl'>

const SEEDS: Record<string, Seed> = {
  'TEE-INDIGO': {
    brand: 'Neelgar', category: 'Topwear', material: 'Cotton',
    colors: ['#2e3f8f', '#9e2a22'], colorNames: ['Indigo', 'Madder red'], sizes: ['S', 'M', 'L', 'XL'],
    rating: 4.6, reviews: 128,
    art: { kind: 'tee', fabric: '#2e3f8f', line: '#4a5cab', motif: 'weave', ground: ['#dfe5f5', '#c9d2ee'] },
  },
  'TEE-MADDER': {
    brand: 'Neelgar', category: 'Topwear', material: 'Cotton',
    colors: ['#9e2a22', '#2e3f8f'], colorNames: ['Madder red', 'Indigo'], sizes: ['S', 'M', 'L', 'XL'],
    rating: 4.5, reviews: 86,
    art: { kind: 'tee', fabric: '#9e2a22', line: '#b8463d', motif: 'weave', ground: ['#f5e2df', '#ecccc7'] },
  },
  'SHIRT-KHADI': {
    brand: 'Loomline', category: 'Topwear', material: 'Cotton',
    colors: ['#d6c9ab'], colorNames: ['Natural'], sizes: ['S', 'M', 'L', 'XL'],
    rating: 4.7, reviews: 54,
    art: { kind: 'overshirt', fabric: '#d6c9ab', line: '#bfb08f', motif: 'slub', ground: ['#eef0f4', '#dfe3ec'] },
  },
  'SOCKS-TURMERIC': {
    brand: 'Haldi Mill', category: 'Socks', material: 'Cotton',
    colors: ['#d9a21b'], colorNames: ['Turmeric'], sizes: ['S', 'M', 'L'],
    rating: 4.3, reviews: 212,
    art: { kind: 'socks', fabric: '#d9a21b', line: '#eab847', motif: 'rib', ground: ['#f7eed8', '#efe0ba'] },
  },
  'CAP-INDIGO': {
    brand: 'Neelgar', category: 'Accessories', material: 'Cotton',
    colors: ['#26357a'], colorNames: ['Indigo'], sizes: ['One size'],
    rating: 4.4, reviews: 73,
    art: { kind: 'cap', fabric: '#26357a', line: '#3e4f96', motif: 'twill', ground: ['#e4e8f6', '#cfd6ef'] },
  },
  'SCARF-BLOCK': {
    brand: 'Bagru Press', category: 'Accessories', material: 'Linen',
    colors: ['#ece0c6', '#9e2a22'], colorNames: ['Ivory', 'Madder red'], sizes: ['One size'],
    rating: 4.8, reviews: 39,
    art: { kind: 'scarf', fabric: '#ece0c6', line: '#9e2a22', motif: 'block', ground: ['#f3eee6', '#e6ded0'] },
  },
  'JACKET-KANTHA': {
    brand: 'Kantha Works', category: 'Outerwear', material: 'Cotton',
    colors: ['#2e3f8f', '#9e2a22', '#d9a21b'], colorNames: ['Indigo', 'Madder red', 'Turmeric'], sizes: ['S', 'M', 'L'],
    rating: 4.9, reviews: 31,
    art: { kind: 'jacket', fabric: '#2e3f8f', line: '#f1e7cf', motif: 'kantha', ground: ['#ebeef6', '#d8def0'] },
  },
  'TOTE-CANVAS': {
    brand: 'Haldi Mill', category: 'Accessories', material: 'Cotton',
    colors: ['#cdbf9f'], colorNames: ['Canvas'], sizes: ['One size'],
    rating: 4.2, reviews: 97,
    art: { kind: 'tote', fabric: '#cdbf9f', line: '#b5a682', motif: 'canvas', ground: ['#f1efe9', '#e4e0d6'] },
  },
}

const FALLBACK_SEED: Seed = {
  brand: 'ShopFlow', category: 'Accessories', material: 'Cotton',
  colors: ['#8a90a8'], colorNames: ['Slate'], sizes: ['One size'],
  rating: 0, reviews: 0,
  art: { kind: 'tote', fabric: '#8a90a8', line: '#a4a9bd', motif: 'canvas', ground: ['#eceef4', '#dde1ea'] },
}

const withImage = (seed: Seed): CatalogEntry => ({ ...seed, imageUrl: garmentImage(seed.art) })

export const CATALOG: Record<string, CatalogEntry> = Object.fromEntries(
  Object.entries(SEEDS).map(([sku, seed]) => [sku, withImage(seed)]),
)

/** For products created by an admin after the demo seed: a plain, clearly generic look. */
export const FALLBACK: CatalogEntry = withImage(FALLBACK_SEED)

export function catalogFor(sku: string): CatalogEntry {
  return CATALOG[sku] ?? FALLBACK
}

/** The product in another colour and/or view (PDP gallery and swatches). */
export function productImage(sku: string, options: { color?: string; view?: ArtView } = {}): string {
  const entry = catalogFor(sku)
  const spec = options.color ? recolor(entry.art, options.color) : entry.art
  return garmentImage(spec, options.view ?? 'front')
}

// --- facets ----------------------------------------------------------------------------------------------------

const CATEGORY_ORDER: Category[] = ['Topwear', 'Socks', 'Accessories', 'Outerwear']
const entries = (): CatalogEntry[] => Object.values(CATALOG)
const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))

export const categories = (): Category[] => [...CATEGORY_ORDER]
export const brands = (): string[] => uniqueSorted(entries().map((e) => e.brand))
export const materials = (): Material[] => uniqueSorted(entries().map((e) => e.material)) as Material[]

/** Every colour used in the catalogue, once, with its name. */
export function colors(): { hex: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const entry of entries()) entry.colors.forEach((hex, i) => seen.has(hex) || seen.set(hex, entry.colorNames[i]))
  return [...seen].map(([hex, name]) => ({ hex, name }))
}

export const PRICE_STEP_PAISE = 10_000 // ₹100 steps on the price slider
const PRICE_CEILING_PAISE = 500_000 // the slider always reaches at least ₹5,000

/** Slider bounds for a list of products: from ₹0 up to at least ₹5,000, rounded up to a whole ₹500. */
export function priceBounds(products: readonly { price_paise: number }[]): { min: number; max: number } {
  const highest = Math.max(0, ...products.map((p) => p.price_paise))
  const roundedUp = Math.ceil(highest / 50_000) * 50_000
  return { min: 0, max: Math.max(PRICE_CEILING_PAISE, roundedUp) }
}

export const CATEGORY_INFO: Record<Category | 'All', { title: string; tagline: string }> = {
  All: { title: 'All pieces', tagline: 'Every piece from every maker, in small batches.' },
  Topwear: { title: 'Topwear', tagline: 'Tees and overshirts, hand-dyed in indigo, madder and khadi.' },
  Socks: { title: 'Socks', tagline: 'Everyday pairs, dyed with turmeric.' },
  Accessories: { title: 'Accessories', tagline: 'Caps, scarves and totes that finish the look.' },
  Outerwear: { title: 'Outerwear', tagline: 'Layers stitched by hand, one run at a time.' },
}

export function isCategory(value: string | null): value is Category {
  return value !== null && (CATEGORY_ORDER as string[]).includes(value)
}
