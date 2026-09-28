// Size is display-only: the cart is keyed by product_id, so a product can't be in the cart twice in two sizes.
// We remember the chosen size per product in this browser and write it into the shipping address text at checkout,
// where the shop can read it. It is never sent as a separate field.

import { readJson, writeJson } from './storage'

const KEY = 'shopflow.sizes'
export const SHIPPING_ADDRESS_MAX = 500 // the backend's limit for shipping_address

export function loadSizes(storage?: Storage): Record<string, string> {
  const value = readJson<unknown>(KEY, {}, storage)
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {}
}

export function sizeFor(productId: number, storage?: Storage): string | undefined {
  return loadSizes(storage)[String(productId)]
}

export function saveSize(productId: number, size: string, storage?: Storage): void {
  writeJson(KEY, { ...loadSizes(storage), [String(productId)]: size }, storage)
}

export interface SizedLine {
  label: string // e.g. "Neelgar Heavyweight tee, indigo"
  size?: string
}

/**
 * The address the customer typed, plus an "Items:" line listing chosen sizes, e.g.
 * "14 Residency Road\nItems: Neelgar Heavyweight tee, indigo (M)". Lines without a size are left out. The note is
 * shortened (never the address) so the whole text fits the backend's 500-character limit.
 */
export function addressWithSizes(address: string, lines: readonly SizedLine[], max = SHIPPING_ADDRESS_MAX): string {
  const base = address.trim()
  const sized = lines.filter((line) => line.size)
  if (sized.length === 0) return base
  const note = 'Items: ' + sized.map((line) => `${line.label} (${line.size})`).join(', ')
  const room = max - base.length - 1 // 1 for the newline
  if (room < 12) return base // not enough space for a useful note
  return `${base}\n${note.length <= room ? note : note.slice(0, room - 1) + '…'}`
}
