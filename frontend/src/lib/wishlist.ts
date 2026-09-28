// Wishlist: product ids saved in this browser only (no backend support), guarded like all storage.

import { readJson, writeJson } from './storage'

const KEY = 'shopflow.wishlist'

export function loadWishlist(storage?: Storage): number[] {
  const value = readJson<unknown>(KEY, [], storage)
  return Array.isArray(value) ? value.filter((v): v is number => Number.isInteger(v)) : []
}

export function toggleWishlist(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]
}

export function saveWishlist(ids: readonly number[], storage?: Storage): void {
  writeJson(KEY, ids, storage)
}
