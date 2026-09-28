import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { loadWishlist, saveWishlist, toggleWishlist } from '../lib/wishlist'
import { WishlistContext } from './contexts'

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>(() => loadWishlist())

  const toggle = useCallback((productId: number) => {
    setIds((current) => {
      const next = toggleWishlist(current, productId)
      saveWishlist(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ ids, has: (id: number) => ids.includes(id), toggle }), [ids, toggle])
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}
