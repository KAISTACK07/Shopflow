// Generated garment illustrations (our own work, royalty-free, no network). Each image is a small SVG turned into a
// data: URI, so it renders offline and passes the strict Content-Security-Policy (img-src 'self' data:).

export type GarmentKind = 'tee' | 'overshirt' | 'jacket' | 'hoodie' | 'socks' | 'cap' | 'scarf' | 'tote'
export type Motif = 'weave' | 'slub' | 'rib' | 'twill' | 'block' | 'kantha' | 'canvas'
export type ArtView = 'front' | 'detail' | 'fabric'

export interface ArtSpec {
  kind: GarmentKind
  fabric: string // base fabric colour (hex)
  line: string // texture / print colour (hex)
  motif: Motif
  ground: [string, string] // pastel backdrop gradient, top to bottom
}

const VIEW_BOXES: Record<ArtView, string> = {
  front: '0 0 300 400',
  detail: '70 40 160 213', // closer crop of the upper garment
  fabric: '118 170 64 85', // just the cloth
}

const SHAPES: Record<GarmentKind, string> = {
  tee: '<path d="M105 74 L130 62 Q150 82 170 62 L195 74 L252 106 L234 148 L206 134 L206 334 L94 334 L94 134 L66 148 L48 106 Z"/>',
  overshirt:
    '<path d="M100 70 L128 58 L150 92 L172 58 L200 70 L254 108 L262 256 L236 258 L228 142 L212 134 L214 342 L86 342 L88 134 L72 142 L64 258 L38 256 L46 108 Z"/>',
  jacket:
    '<path d="M98 66 L128 56 L150 96 L172 56 L202 66 L256 104 L266 262 L238 264 L230 140 L214 132 L218 346 L82 346 L86 132 L70 140 L62 264 L34 262 L44 104 Z"/>',
  hoodie:
    '<path d="M104 80 Q106 30 150 28 Q194 30 196 80 L254 110 L266 266 L238 268 L230 146 L214 138 L216 346 L84 346 L86 138 L70 146 L62 268 L34 266 L46 110 Z"/>',
  socks:
    '<path d="M150 58 L196 58 L196 226 Q196 262 232 270 L262 276 Q284 282 282 304 Q280 328 254 328 L200 326 Q152 322 150 276 Z" opacity=".78"/><path d="M104 74 L150 74 L150 244 Q150 280 186 288 L216 294 Q238 300 236 322 Q234 346 208 346 L154 344 Q106 340 104 294 Z"/>',
  cap: '<path d="M78 236 Q76 126 168 122 Q256 126 258 236 Z"/><path d="M46 240 Q150 268 258 238 L260 252 Q150 290 36 254 Z"/>',
  scarf: '<path d="M96 56 L204 56 L216 292 L232 338 L96 338 L108 292 Z"/>',
  tote: '<path d="M68 146 L232 146 L244 344 L56 344 Z"/>',
}

function details(kind: GarmentKind, line: string): string {
  switch (kind) {
    case 'tee':
      return '<path d="M130 62 Q150 82 170 62" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="5"/><path d="M96 322 L204 322" stroke="rgba(0,0,0,.14)" stroke-width="3"/>'
    case 'overshirt':
      return (
        '<path d="M128 58 L150 92 L138 104 L116 64 Z M172 58 L150 92 L162 104 L184 64 Z" fill="rgba(0,0,0,.12)"/>' +
        '<path d="M150 96 L150 342" stroke="rgba(0,0,0,.2)" stroke-width="3"/>' +
        [128, 168, 208, 248, 288].map((y) => `<circle cx="158" cy="${y}" r="4" fill="#6b5a3a"/>`).join('') +
        '<path d="M100 150 h38 v40 h-38 Z M162 150 h38 v40 h-38 Z" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="3"/>'
      )
    case 'jacket':
      return '<path d="M128 56 L150 96 L136 110 L112 60 Z M172 56 L150 96 L164 110 L188 60 Z" fill="rgba(0,0,0,.18)"/><path d="M150 100 L150 346" stroke="rgba(255,255,255,.35)" stroke-width="3"/>'
    case 'hoodie':
      return (
        '<path d="M118 84 Q120 50 150 48 Q180 50 182 84 Q166 100 150 100 Q134 100 118 84 Z" fill="rgba(0,0,0,.22)"/>' +
        '<path d="M140 100 L138 150 M160 100 L162 150" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M106 250 Q150 238 194 250 L200 306 L100 306 Z" fill="rgba(0,0,0,.12)"/>'
      )
    case 'socks':
      return '<path d="M104 74 h46 v22 h-46 Z" fill="rgba(0,0,0,.1)"/>'
    case 'cap':
      return '<path d="M168 122 L168 236 M120 132 Q112 180 116 236 M216 132 Q226 180 222 236" stroke="rgba(0,0,0,.2)" stroke-width="3" fill="none"/><circle cx="168" cy="124" r="7" fill="rgba(0,0,0,.25)"/>'
    case 'scarf':
      return (
        '<path d="M150 56 L156 338" stroke="rgba(0,0,0,.1)" stroke-width="10"/>' +
        Array.from({ length: 17 }, (_, i) => `<path d="M${100 + i * 8} 338 L${100 + i * 8} 358" stroke="${line}" stroke-width="3"/>`).join('')
      )
    case 'tote':
      return '<path d="M108 148 Q108 66 150 66 Q192 66 192 148" fill="none" stroke="#d9a21b" stroke-width="12" stroke-linecap="round"/><path d="M68 170 L232 170" stroke="rgba(0,0,0,.12)" stroke-width="3"/>'
  }
}

function pattern(spec: ArtSpec): string {
  const { fabric: b, line: l } = spec
  switch (spec.motif) {
    case 'block':
      return `<pattern id="f" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="${b}"/><circle cx="18" cy="18" r="7" fill="none" stroke="${l}" stroke-width="2.5"/><circle cx="18" cy="18" r="2.5" fill="${l}"/><path d="M0 0 L6 6 M36 0 L30 6 M0 36 L6 30 M36 36 L30 30" stroke="${l}" stroke-width="2"/></pattern>`
    case 'kantha':
      return `<pattern id="f" width="300" height="56" patternUnits="userSpaceOnUse"><rect width="300" height="56" fill="${b}"/><rect y="18" width="300" height="18" fill="#9e2a22"/><rect y="36" width="300" height="10" fill="#d9a21b"/><path d="M0 9 H300 M0 27 H300 M0 50 H300" stroke="${l}" stroke-width="2" stroke-dasharray="6 5"/></pattern>`
    case 'slub':
      return `<pattern id="f" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="${b}"/><path d="M2 4 h9 M14 11 h7 M5 14 h4" stroke="${l}" stroke-width="2" stroke-linecap="round"/></pattern>`
    case 'rib':
      return `<pattern id="f" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${b}"/><path d="M4 0 V8" stroke="${l}" stroke-width="2"/></pattern>`
    case 'twill':
      return `<pattern id="f" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${b}"/><path d="M0 10 L10 0" stroke="${l}" stroke-width="2"/></pattern>`
    case 'canvas':
      return `<pattern id="f" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${b}"/><path d="M0 4 H8 M4 0 V8" stroke="${l}" stroke-width="1"/></pattern>`
    case 'weave':
      return `<pattern id="f" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${b}"/><path d="M0 3 H6" stroke="${l}" stroke-width="1"/></pattern>`
  }
}

/** The SVG markup for one garment in one view. Each image is its own document, so ids can't collide. */
export function garmentSvg(spec: ArtSpec, view: ArtView = 'front', backdrop = true): string {
  const [top, bottom] = spec.ground
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOXES[view]}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>${pattern(spec)}</defs>` +
    (backdrop ? '<rect x="-50" y="-50" width="400" height="500" fill="url(#g)"/>' : '') +
    '<ellipse cx="150" cy="362" rx="112" ry="12" fill="rgba(20,24,50,.12)"/>' +
    `<g fill="url(#f)">${SHAPES[spec.kind]}</g>${details(spec.kind, spec.line)}</svg>`
  )
}

/** A data: URI for <img src>. backdrop=false leaves only the garment (for images floating on the hero). */
export function garmentImage(spec: ArtSpec, view: ArtView = 'front', backdrop = true): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(garmentSvg(spec, view, backdrop))}`
}

/** Same garment in another fabric colour (for colour swatches). Texture lines are a lighter mix of the new colour. */
export function recolor(spec: ArtSpec, fabric: string): ArtSpec {
  return spec.fabric.toLowerCase() === fabric.toLowerCase() ? spec : { ...spec, fabric, line: mix(fabric, '#ffffff', 0.18) }
}

function mix(hex: string, other: string, amount: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = parse(hex)
  const b = parse(other)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')
}
