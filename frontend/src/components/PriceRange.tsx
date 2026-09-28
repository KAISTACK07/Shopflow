import { PRICE_STEP_PAISE } from '../lib/catalog'
import { formatPaise } from '../lib/money'

/** Dual-thumb price slider in paise. Two labelled native range inputs, so each thumb works with the keyboard. */
export function PriceRange({
  bounds,
  min,
  max,
  onChange,
}: {
  bounds: { min: number; max: number }
  min: number
  max: number
  onChange: (min: number, max: number) => void
}) {
  const span = bounds.max - bounds.min || 1
  const left = ((min - bounds.min) / span) * 100
  const right = 100 - ((max - bounds.min) / span) * 100
  const rupees = (paise: number) => formatPaise(paise).replace(/\.00$/, '')

  return (
    <div>
      <div className="dual-range relative h-6">
        <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-pill bg-surface-2" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-pill bg-pill-active" style={{ left: `${left}%`, right: `${right}%` }} />
        <input type="range" aria-label="Minimum price" min={bounds.min} max={bounds.max} step={PRICE_STEP_PAISE} value={min}
          aria-valuetext={rupees(min)} onChange={(e) => onChange(Math.min(Number(e.target.value), max - PRICE_STEP_PAISE), max)} />
        <input type="range" aria-label="Maximum price" min={bounds.min} max={bounds.max} step={PRICE_STEP_PAISE} value={max}
          aria-valuetext={rupees(max)} onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + PRICE_STEP_PAISE))} />
      </div>
      <div className="mt-2 flex justify-between text-sm font-semibold tabular-nums" aria-hidden="true">
        <span>{rupees(min)}</span>
        <span>{rupees(max)}</span>
      </div>
    </div>
  )
}
