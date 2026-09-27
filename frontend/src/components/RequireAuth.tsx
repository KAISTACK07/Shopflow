import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../state/contexts'
import { Loading } from './ui'

/** Sends logged-out visitors to the login page (and back here afterwards). The API enforces the same rules;
 *  this only avoids showing screens that would fail. */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <Loading what="your account" />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && user.role !== 'admin') {
    return <p className="py-8">This page is for shop admins. Log in with an admin account to manage products.</p>
  }
  return children
}
