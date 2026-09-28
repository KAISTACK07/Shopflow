import { Link } from 'react-router'
import type { Product } from '../api/types'
import { catalogFor, categories, CATALOG, type Category } from '../lib/catalog'
import { SORT_OPTIONS, type SortKey } from '../lib/filters'
import { ChevronRight, GridIcon, ListIcon } from './icons'

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (value: SortKey) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <span className="sr-only sm:not-sr-only">Sort by</span>
      <select value={value} onChange={(e) => onChange(e.target.value as SortKey)}
        className="min-h-10 rounded-control border border-rule bg-surface px-3 font-semibold">
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function ViewToggle({ value, onChange }: { value: 'grid' | 'list'; onChange: (value: 'grid' | 'list') => void }) {
  const option = (v: 'grid' | 'list', label: string, Icon: typeof GridIcon) => (
    <button type="button" aria-pressed={value === v} aria-label={label} onClick={() => onChange(v)}
      className={`grid size-10 place-items-center rounded-control transition ${value === v ? 'bg-cta text-on-cta' : 'text-slate hover:bg-surface-2'}`}>
      <Icon size={18} />
    </button>
  )
  return (
    <div className="flex gap-1 rounded-control border border-rule bg-surface p-0.5" role="group" aria-label="Layout">
      {option('grid', 'Grid view', GridIcon)}
      {option('list', 'List view', ListIcon)}
    </div>
  )
}

/** Horizontal category chips (phones and tablets, where the rail lives in a drawer). */
export function CategoryChips({ active, onSelect }: { active: Category | 'All'; onSelect: (c: Category | 'All') => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Categories">
      {(['All', ...categories()] as const).map((c) => (
        <button key={c} type="button" aria-pressed={active === c} onClick={() => onSelect(c)}
          className={`min-h-10 shrink-0 rounded-pill border px-4 text-sm font-semibold transition ${active === c ? 'border-transparent bg-pill-active' : 'border-rule bg-surface hover:border-indigo'}`}>
          {c}
        </button>
      ))}
    </div>
  )
}

/** Home page quick-nav: one card per category with a sample image and how many items it holds. */
export function CategoryCards({ products }: { products: readonly Product[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {categories().map((category) => {
        const inCategory = products.filter((p) => catalogFor(p.sku).category === category)
        const sample = inCategory[0] ? catalogFor(inCategory[0].sku) : Object.values(CATALOG).find((e) => e.category === category)
        return (
          <li key={category}>
            <Link to={`/?category=${category}`}
              className="group flex items-center gap-3 rounded-card border border-rule bg-surface p-2.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
              {sample && <img src={sample.imageUrl} alt="" className="size-16 shrink-0 rounded-[10px] object-cover" />}
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{category}</span>
                <span className="text-sm text-slate">{inCategory.length} {inCategory.length === 1 ? 'item' : 'items'}</span>
              </span>
              <ChevronRight size={18} className="text-slate transition group-hover:translate-x-0.5 group-hover:text-indigo" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
