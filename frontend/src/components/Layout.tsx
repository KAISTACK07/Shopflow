import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth, useCart } from '../state/contexts'

const navLink = ({ isActive }: { isActive: boolean }) =>
  `px-1 py-1 font-medium ${isActive ? 'text-indigo underline decoration-2 underline-offset-8' : 'text-ink hover:text-indigo'}`

export function Layout() {
  const { user, logout } = useAuth()
  const { cart } = useCart()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="font-numeral text-3xl text-indigo">
            ShopFlow
          </Link>
          <nav className="flex flex-wrap items-center gap-4" aria-label="Main">
            <NavLink to="/" end className={navLink}>
              Shop
            </NavLink>
            {user && (
              <NavLink to="/orders" className={navLink}>
                Orders
              </NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/admin/products" className={navLink}>
                Manage products
              </NavLink>
            )}
            {user && (
              <NavLink to="/cart" className={navLink}>
                Cart{cart && cart.total_quantity > 0 ? ` (${cart.total_quantity})` : ''}
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            {user ? (
              <>
                <span className="hidden text-slate sm:inline">{user.email}</span>
                <button
                  className="font-medium text-ink hover:text-indigo"
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLink}>
                  Log in
                </NavLink>
                <NavLink to="/register" className={navLink}>
                  Create account
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
