// Contexts and their hooks live here (no components), so the provider files export only components and
// React's fast refresh keeps working during development.

import { createContext, useContext } from 'react'
import type { Cart, User } from '../api/types'

export interface AuthState {
  user: User | null
  /** False until we know whether a stored token is still valid (avoids flashing the logged-out UI). */
  ready: boolean
  /** remember: keep the token after the browser closes ("Keep me signed in"). */
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

export interface CartState {
  /** null when logged out (or not loaded yet). Totals always come from the server. */
  cart: Cart | null
  setCart: (cart: Cart) => void
  refresh: () => Promise<void>
}

export interface WishlistState {
  /** Saved product ids, in this browser only. */
  ids: number[]
  has: (productId: number) => boolean
  toggle: (productId: number) => void
}

export const AuthContext = createContext<AuthState | null>(null)
export const CartContext = createContext<CartState | null>(null)
export const WishlistContext = createContext<WishlistState | null>(null)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

export function useCart(): CartState {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside <CartProvider>')
  return context
}

export function useWishlist(): WishlistState {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used inside <WishlistProvider>')
  return context
}
