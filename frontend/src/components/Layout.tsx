import { Outlet } from 'react-router'
import { Header } from './Header'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-rule bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-sm text-slate">
          <span><span className="font-bold text-ink">ShopFlow</span>, small-batch pieces from independent makers.</span>
          <span>Demo shop: no payment is taken for orders.</span>
        </div>
      </footer>
    </div>
  )
}
