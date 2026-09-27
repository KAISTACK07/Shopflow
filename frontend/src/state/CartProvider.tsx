import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../api/endpoints'
import type { Cart } from '../api/types'
import { CartContext, useAuth } from './contexts'

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Remember whose cart this is. After logout (or a user switch) the stored cart simply doesn't match
  // the current user and is hidden, with no effect needed to clear it.
  const [loaded, setLoaded] = useState<{ userId: number; cart: Cart } | null>(null)
  const userId = user?.id ?? null

  const refresh = useCallback(async () => {
    if (userId === null) return
    const cart = await api.getCart()
    setLoaded({ userId, cart })
  }, [userId])

  const setCart = useCallback((cart: Cart) => {
    if (userId !== null) setLoaded({ userId, cart })
  }, [userId])

  useEffect(() => {
    if (userId === null) return
    let cancelled = false // a response for a previous user (logout/switch mid-request) must not land
    api.getCart().then(
      (cart) => !cancelled && setLoaded({ userId, cart }),
      () => {}, // the cart page shows its own loading state and retries via refresh()
    )
    return () => {
      cancelled = true
    }
  }, [userId])

  const cart = loaded && loaded.userId === userId ? loaded.cart : null
  const value = useMemo(() => ({ cart, setCart, refresh }), [cart, setCart, refresh])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
