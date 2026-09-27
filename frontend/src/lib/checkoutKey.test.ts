import { describe, expect, it } from 'vitest'
import { clearCheckoutKey, currentCheckoutKey, newUuid } from './checkoutKey'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('checkout idempotency key', () => {
  it('reuses the same key for every retry until cleared', () => {
    const storage = memoryStorage()

    const first = currentCheckoutKey(storage)
    const retry = currentCheckoutKey(storage)

    expect(retry).toBe(first)
    expect(first).toMatch(UUID_V4)
  })

  it('starts a new key after a successful checkout clears it', () => {
    const storage = memoryStorage()
    const first = currentCheckoutKey(storage)

    clearCheckoutKey(storage)

    expect(currentCheckoutKey(storage)).not.toBe(first)
  })

  it('still works when storage throws (e.g. disabled in private mode)', () => {
    const broken = { ...memoryStorage(), getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }

    expect(currentCheckoutKey(broken as Storage)).toMatch(UUID_V4)
  })
})

describe('newUuid fallback', () => {
  it('builds a valid v4 UUID without crypto.randomUUID (non-HTTPS pages)', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const ids = new Set(Array.from({ length: 100 }, newUuid))
      expect([...ids].every((id) => UUID_V4.test(id))).toBe(true)
      expect(ids.size).toBe(100)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
