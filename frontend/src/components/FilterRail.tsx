import { useId, type ComponentType, type SVGProps } from 'react'
import type { Product } from '../api/types'
import { brands, categories, colors, materials, type Category } from '../lib/catalog'
import { facetCounts, toggleValue, type ProductFilters } from '../lib/filters'
import { AllIcon, JacketIcon, SockIcon, TagIcon, TeeIcon } from './icons'
import { PriceRange } from './PriceRange'

type RailFilters = Pick<ProductFilters, 'inStockOnly' | 'brands' | 'materials' | 'colors' | 'priceMin' | 'priceMax'>

const CATEGORY_ICONS: Record<Category | 'All', ComponentType<SVGProps<SVGSVGElement> & { size?: number }>> = {
  All: AllIcon, Topwear: TeeIcon, Socks: SockIcon, Accessories: TagIcon, Outerwear: JacketIcon,
}

/** Categories (URL-backed) plus the client-side filters. Counts are live: each reflects all the other filters. */
export function FilterRail({
  products,
  filters,
  bounds,
  onCategory,
  onChange,
  onClear,
}: {
  products: readonly Product[]
  filters: ProductFilters
  bounds: { min: number; max: number }
  onCategory: (category: Category | 'All') => void
  onChange: (changes: Partial<RailFilters>) => void
  onClear: () => void
}) {
  const categoryCounts = facetCounts(products, filters, 'category')
  const brandCounts = facetCounts(products, filters, 'brand')
  const materialCounts = facetCounts(products, filters, 'material')
  const allCount = [...categoryCounts.values()].reduce((sum, n) => sum + n, 0)
  const id = useId() // the rail can be on the page twice (column + phone drawer): keep ids unique

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby={`${id}-categories`}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id={`${id}-categories`} className="text-xl">Categories</h2>
          <button type="button" onClick={() => onCategory('All')} className="text-sm font-semibold text-indigo hover:underline">See all →</button>
        </div>
        <ul className="flex flex-col gap-1">
          {(['All', ...categories()] as const).map((category) => {
            const Icon = CATEGORY_ICONS[category]
            const active = filters.category === category
            const count = category === 'All' ? allCount : (categoryCounts.get(category) ?? 0)
            return (
              <li key={category}>
                <button type="button" onClick={() => onCategory(category)} aria-pressed={active}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-pill px-4 text-left font-semibold transition ${active ? 'bg-pill-active shadow-card' : 'hover:bg-surface-2'}`}>
                  <Icon size={18} />
                  <span className="flex-1">{category}</span>
                  <span className={`text-sm tabular-nums ${active ? '' : 'text-slate'}`}>{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby={`${id}-filters`} className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <h2 id={`${id}-filters`} className="text-xl">Filters</h2>
          <button type="button" onClick={onClear} className="text-sm font-semibold text-indigo hover:underline">Clear all</button>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-semibold">
          In stock only
          <input type="checkbox" role="switch" checked={filters.inStockOnly} onChange={(e) => onChange({ inStockOnly: e.target.checked })}
            className="relative h-6 w-11 cursor-pointer appearance-none rounded-pill bg-rule transition before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-pill before:bg-surface before:shadow before:transition checked:bg-indigo checked:before:translate-x-5" />
        </label>

        <CheckboxGroup legend="Brand" values={brands()} selected={filters.brands} counts={brandCounts}
          onToggle={(v) => onChange({ brands: toggleValue(filters.brands, v) })} />

        <fieldset>
          <legend className="mb-3 font-bold">Price range</legend>
          <PriceRange bounds={bounds} min={Math.max(filters.priceMin, bounds.min)} max={Math.min(filters.priceMax, bounds.max)}
            onChange={(priceMin, priceMax) => onChange({ priceMin, priceMax })} />
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-bold">Colour</legend>
          <div className="flex flex-wrap gap-2.5">
            {colors().map(({ hex, name }) => {
              const on = filters.colors.includes(hex)
              return (
                <button key={hex} type="button" title={name} aria-label={name} aria-pressed={on}
                  onClick={() => onChange({ colors: toggleValue(filters.colors, hex) })}
                  className={`size-9 rounded-pill border-2 transition active:scale-90 ${on ? 'border-indigo ring-2 ring-indigo ring-offset-2 ring-offset-surface' : 'border-rule'}`}
                  style={{ background: hex }} />
              )
            })}
          </div>
        </fieldset>

        <CheckboxGroup legend="Material" values={materials()} selected={filters.materials} counts={materialCounts}
          onToggle={(v) => onChange({ materials: toggleValue(filters.materials, v) })} />
      </section>
    </div>
  )
}

function CheckboxGroup({ legend, values, selected, counts, onToggle }: {
  legend: string
  values: string[]
  selected: string[]
  counts: Map<string, number>
  onToggle: (value: string) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-bold">{legend}</legend>
      {values.map((value) => (
        <label key={value} className="flex min-h-10 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} className="size-4.5 accent-indigo" />
          <span className="flex-1">{value}</span>
          <span className="text-sm text-slate tabular-nums">{counts.get(value) ?? 0}</span>
        </label>
      ))}
    </fieldset>
  )
}
