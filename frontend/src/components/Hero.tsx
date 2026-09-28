import { useState } from 'react'
import { Link } from 'react-router'
import { garmentImage, type ArtSpec } from '../lib/art'
import { CATALOG } from '../lib/catalog'
import { TrustBadges } from './bits'
import { ArrowRight, ChevronLeft, ChevronRight, FlameIcon, PlayIcon } from './icons'
import { ctaButton, quietButton } from './ui'

// The hero hoodie is an illustration for the banner, not a product for sale.
const HOODIE: ArtSpec = { kind: 'hoodie', fabric: '#2e3f8f', line: '#4a5cab', motif: 'weave', ground: ['#dfe5f5', '#c9d2ee'] }

const SLIDES = [
  { label: 'Hand-dyed indigo hoodie', src: garmentImage(HOODIE, 'front', false) },
  { label: 'Quilted kantha jacket', src: garmentImage(CATALOG['JACKET-KANTHA'].art, 'front', false) },
  { label: 'Block-print scarf', src: garmentImage(CATALOG['SCARF-BLOCK'].art, 'front', false) },
  { label: 'Heavyweight tee, madder red', src: garmentImage(CATALOG['TEE-MADDER'].art, 'front', false) },
]

export function Hero() {
  const [index, setIndex] = useState(0)
  const go = (step: number) => setIndex((i) => (i + step + SLIDES.length) % SLIDES.length)
  const slide = SLIDES[index]

  return (
    <section className="bg-holo relative overflow-hidden rounded-hero border border-rule px-5 py-8 sm:px-10 sm:py-12" aria-labelledby="hero-title">
      <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          <span className="rounded-pill bg-surface/80 px-3.5 py-1.5 text-xs font-extrabold tracking-[.14em] text-indigo shadow-card">LIMITED RUNS</span>
          <h1 id="hero-title" className="text-5xl sm:text-6xl lg:text-7xl">
            Dyed by Hand,
            <br />
            Made for <span className="text-gradient-you">You</span>
          </h1>
          <p className="max-w-md text-lg text-ink-soft">
            Eight pieces, each made in a small batch. The number on every photo is how many are left.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/?category=All" className={`${ctaButton} px-6 text-base`}>
              Shop the Collection <ArrowRight size={18} />
            </Link>
            <button type="button" aria-disabled="true" title="Coming soon" className={`${quietButton} min-h-11 cursor-not-allowed px-5 text-base opacity-60`}>
              <PlayIcon size={18} /> Watch the story <span className="sr-only">(coming soon)</span>
            </button>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-md items-center justify-center">
          <div className="absolute inset-6 rounded-full bg-surface/50 blur-2xl" aria-hidden="true" />
          <img key={slide.src} src={slide.src} alt={slide.label} className="animate-fade-in relative z-10 aspect-[3/4] w-[72%] max-w-72 drop-shadow-2xl" />

          <span className="absolute top-1 left-0 z-20 -rotate-6 font-hand text-2xl text-ink sm:text-3xl" aria-hidden="true">
            Unique Pieces
            <svg viewBox="0 0 60 40" className="ml-6 h-8 w-12 text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4 C 20 6, 34 16, 50 32" />
              <path d="M40 31 L50 32 L48 22" />
            </svg>
          </span>

          <span className="absolute bottom-3 left-0 z-20 inline-flex items-center gap-1.5 rounded-pill bg-surface px-3.5 py-2 text-sm font-bold shadow-lift">
            <FlameIcon size={17} className="text-madder" />
            Only 8 pieces in this batch
          </span>

          <div className="absolute top-1/2 right-0 z-20 flex -translate-y-1/2 flex-col items-center gap-2">
            <button type="button" onClick={() => go(-1)} aria-label="Previous piece" className="grid size-9 place-items-center rounded-pill bg-surface shadow-card hover:bg-surface-2">
              <ChevronLeft size={18} className="rotate-90" />
            </button>
            {SLIDES.map((s, i) => (
              <button key={s.label} type="button" onClick={() => setIndex(i)} aria-label={`Show ${s.label}`} aria-current={i === index}
                className={`grid size-12 place-items-center overflow-hidden rounded-pill border-2 bg-surface transition ${i === index ? 'border-indigo shadow-card' : 'border-surface opacity-80 hover:opacity-100'}`}>
                <img src={s.src} alt="" className="size-10 object-contain" />
              </button>
            ))}
            <button type="button" onClick={() => go(1)} aria-label="Next piece" className="grid size-9 place-items-center rounded-pill bg-surface shadow-card hover:bg-surface-2">
              <ChevronRight size={18} className="rotate-90" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function TrustStrip() {
  return (
    <section aria-label="Why shop with us" className="rounded-card border border-rule bg-surface px-5 py-4 shadow-card">
      <TrustBadges />
    </section>
  )
}
