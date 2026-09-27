// One Idempotency-Key per checkout *attempt*, reused on every retry of that attempt, until it succeeds.
// Kept in sessionStorage so it survives a page reload in the middle of a flaky checkout.

const STORAGE_KEY = 'shopflow.checkoutKey'

export function currentCheckoutKey(storage: Storage = sessionStorage): string {
  const existing = safeGet(storage)
  if (existing) return existing
  const key = newUuid()
  try {
    storage.setItem(STORAGE_KEY, key)
  } catch {
    // Storage disabled (private mode): the key still works for retries within this page.
  }
  return key
}

export function clearCheckoutKey(storage: Storage = sessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // nothing stored, nothing to clear
  }
}

function safeGet(storage: Storage): string | null {
  try {
    return storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** crypto.randomUUID only exists in secure contexts (HTTPS or localhost); fall back to getRandomValues. */
export function newUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
