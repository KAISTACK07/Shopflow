import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { catalogFor } from '../lib/catalog'
import { formatPaise } from '../lib/money'
import { sizeFor } from '../lib/sizes'
import { currentTheme, saveTheme, type Theme } from '../lib/theme'
import { initialsFromEmail } from '../lib/user'
import { useAuth, useCart, useWishlist } from '../state/contexts'
import { Drawer } from './Drawer'
import { BagIcon, HeartIcon, MoonIcon, SearchIcon, SunIcon } from './icons'
import { ctaButton, quietButton } from './ui'

const SEARCH_DELAY_MS = 300

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface/90 shadow-bar backdrop-blur-md">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 lg:grid-cols-[auto_auto_1fr_auto]">
        <Link to="/" className="font-numeral text-[2rem] leading-none tracking-tight" aria-label="ShopFlow home">
          <span className="text-ink">Shop</span><span className="text-indigo">Flow</span>
        </Link>
        <MainNav className="hidden lg:flex" />
        <div className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-1 lg:col-start-3">
          <SearchPill />
        </div>
        <div className="col-start-3 row-start-1 flex items-center gap-1 lg:col-start-4">
          <ThemeToggle />
          <WishlistLink />
          <CartButton />
          <UserMenu />
        </div>
      </div>
      <MainNav className="mx-auto flex max-w-7xl overflow-x-auto px-4 pb-2 lg:hidden" />
    </header>
  )
}

function MainNav({ className }: { className: string }) {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const onShop = pathname === '/'
  const listing = onShop && (params.has('category') || params.has('q') || params.has('saved'))
  const item = (label: string, to: string, active: boolean) => (
    <Link key={label} to={to} aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded-pill px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-surface-2 text-indigo' : 'text-ink hover:text-indigo'}`}>
      {label}
    </Link>
  )
  const soon = (label: string) => (
    <span key={label} aria-disabled="true" title="Coming soon" className="shrink-0 cursor-not-allowed px-3 py-1.5 text-sm font-semibold text-slate/70">
      {label}<span className="sr-only"> (coming soon)</span>
    </span>
  )
  return (
    <nav aria-label="Main" className={`items-center gap-1 ${className}`}>
      {item('Home', '/', onShop && !listing)}
      {item('Shop', '/?category=All', listing && params.get('sort') !== 'newest')}
      {item('New Arrivals', '/?category=All&sort=newest', listing && params.get('sort') === 'newest')}
      {soon('Deals')}
      {soon('About')}
    </nav>
  )
}

/** Search box: debounced, synced with ?q= on the shop page, and focused by pressing "/" anywhere. */
function SearchPill() {
  const location = useLocation()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const urlQ = location.pathname === '/' ? (new URLSearchParams(location.search).get('q') ?? '') : ''
  const [text, setText] = useState(urlQ)
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ)
  const [submitted, setSubmitted] = useState(urlQ)

  // The URL changed without us (back button, "Clear filters"): show its value. A change we made ourselves must
  // not overwrite what the user has typed since.
  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ)
    if (urlQ !== submitted) setText(urlQ)
  }

  useEffect(() => {
    const wanted = text.trim()
    if (wanted === urlQ) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(location.pathname === '/' ? location.search : '')
      if (wanted) next.set('q', wanted)
      else next.delete('q')
      next.delete('offset') // new search, first page
      setSubmitted(wanted)
      navigate({ pathname: '/', search: next.toString() ? `?${next}` : '' })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, urlQ, location.pathname, location.search, navigate])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <label htmlFor="site-search" className="sr-only">Search products</label>
      <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate" />
      <input ref={input} id="site-search" type="search" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Search for products, brands or SKU…" autoComplete="off"
        className="min-h-11 w-full rounded-pill border border-transparent bg-search pr-12 pl-11 text-ink placeholder:text-slate/90 transition focus:border-indigo focus:bg-surface" />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-rule bg-surface px-2 py-0.5 text-xs font-bold text-slate sm:block" aria-hidden="true">/</kbd>
    </div>
  )
}

const iconButton = 'relative grid size-11 place-items-center rounded-pill text-ink transition hover:bg-surface-2 active:scale-95'

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className={iconButton} aria-label={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next
        saveTheme(next)
        setTheme(next)
      }}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-pill bg-madder px-1 text-[0.6875rem] leading-5 font-extrabold text-surface" aria-hidden="true">
      {count}
    </span>
  )
}

function WishlistLink() {
  const { ids } = useWishlist()
  return (
    <Link to="/?saved=1" className={`${iconButton} hidden sm:grid`} aria-label={`Wishlist, ${ids.length} saved`}>
      <HeartIcon />
      <CountBadge count={ids.length} />
    </Link>
  )
}

/** Wide screens: a quick-look drawer. Phones: straight to the bag page. */
function CartButton() {
  const { user } = useAuth()
  const { cart } = useCart()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const count = cart?.total_quantity ?? 0

  function onClick() {
    if (!user) return navigate('/login?next=%2Fcart')
    if (window.matchMedia('(min-width: 768px)').matches) setOpen(true)
    else navigate('/cart')
  }

  return (
    <>
      <button type="button" className={iconButton} onClick={onClick} aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
        <BagIcon />
        <CountBadge count={count} />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Your Cart (${count})`} side="right"
        footer={cart && cart.items.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-lg font-bold"><span>Subtotal</span><span className="tabular-nums">{formatPaise(cart.subtotal_paise)}</span></div>
            <Link to="/cart" onClick={() => setOpen(false)} className={`${ctaButton} w-full`}>View bag and checkout</Link>
          </div>
        )}>
        {!cart || cart.items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-lg font-bold">Your cart is empty</p>
            <p className="text-slate">Pieces sell out fast. Add something before it's gone.</p>
            <button type="button" onClick={() => setOpen(false)} className={quietButton}>Keep shopping</button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {cart.items.map((item) => {
              const entry = catalogFor(item.sku)
              const size = entry.sizes.length > 1 ? sizeFor(item.product_id) : undefined
              return (
                <li key={item.product_id} className="flex gap-3 py-3">
                  <img src={entry.imageUrl} alt="" className="h-20 w-16 shrink-0 rounded-[10px] object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate">{entry.brand}</p>
                    <p className="font-semibold leading-snug">{item.name}</p>
                    <p className="text-sm text-slate">{size ? `Size ${size} · ` : ''}Qty {item.quantity}</p>
                  </div>
                  <p className="font-bold tabular-nums">{formatPaise(item.line_total_paise)}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Drawer>
    </>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => box.current?.contains(e.target as Node) || setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) {
    return <Link to="/login" className={`${quietButton} ml-1 rounded-pill`}>Log in</Link>
  }
  const menuItem = 'block w-full rounded-control px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2'
  return (
    <div ref={box} className="relative ml-1">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${user.email}`}
        className="bg-pill-active grid size-10 place-items-center rounded-pill text-sm font-extrabold shadow-card transition active:scale-95">
        {initialsFromEmail(user.email)}
      </button>
      {open && (
        <div role="menu" className="animate-fade-in absolute top-12 right-0 z-50 w-60 rounded-card border border-rule bg-surface p-2 shadow-lift">
          <p className="truncate px-3 py-2 text-sm text-slate" title={user.email}>{user.email}</p>
          <Link role="menuitem" to="/orders" onClick={() => setOpen(false)} className={menuItem}>My orders</Link>
          <Link role="menuitem" to="/?saved=1" onClick={() => setOpen(false)} className={`${menuItem} sm:hidden`}>Wishlist</Link>
          {user.role === 'admin' && <Link role="menuitem" to="/admin/products" onClick={() => setOpen(false)} className={menuItem}>Manage products</Link>}
          <button role="menuitem" type="button" className={menuItem} onClick={() => { setOpen(false); logout(); navigate('/') }}>Log out</button>
        </div>
      )}
    </div>
  )
}
