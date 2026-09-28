import { describe, expect, it } from 'vitest'
import { brokenStorage, memoryStorage } from '../test/memoryStorage'
import { passwordAcceptable, passwordChecks } from './password'
import { addressWithSizes, loadSizes, saveSize, sizeFor } from './sizes'
import { stockLabel, stockLevel } from './stock'
import { saveTheme, storedTheme } from './theme'
import { initialsFromEmail, safeNextPath } from './user'
import { loadWishlist, saveWishlist, toggleWishlist } from './wishlist'

describe('size memory', () => {
  it('remembers the chosen size per product id', () => {
    const storage = memoryStorage()
    saveSize(1, 'M', storage)
    saveSize(2, 'L', storage)
    saveSize(1, 'XL', storage) // changed their mind

    expect(sizeFor(1, storage)).toBe('XL')
    expect(sizeFor(2, storage)).toBe('L')
    expect(sizeFor(3, storage)).toBeUndefined()
  })

  it('survives blocked or corrupt storage', () => {
    expect(() => saveSize(1, 'M', brokenStorage())).not.toThrow()
    expect(loadSizes(brokenStorage())).toEqual({})
    const corrupt = memoryStorage()
    corrupt.setItem('shopflow.sizes', '[1,2,3]')
    expect(loadSizes(corrupt)).toEqual({})
  })
})

describe('addressWithSizes', () => {
  const lines = [
    { label: 'Neelgar Heavyweight tee, indigo', size: 'M' },
    { label: 'Neelgar Indigo cap' }, // one size: nothing to add
    { label: 'Kantha Works Quilted kantha jacket', size: 'L' },
  ]

  it('appends the chosen sizes on their own line', () => {
    expect(addressWithSizes('14 Residency Road, Bengaluru', lines)).toBe(
      '14 Residency Road, Bengaluru\nItems: Neelgar Heavyweight tee, indigo (M), Kantha Works Quilted kantha jacket (L)',
    )
  })

  it('leaves the address alone when nothing has a size', () => {
    expect(addressWithSizes('  14 Residency Road  ', [{ label: 'Cap' }])).toBe('14 Residency Road')
  })

  it("shortens the note, never the address, to stay within the backend's limit", () => {
    const address = 'A'.repeat(450)
    const result = addressWithSizes(address, lines, 500)
    expect(result.length).toBe(500)
    expect(result.startsWith(address + '\nItems: ')).toBe(true)
    expect(result.endsWith('…')).toBe(true)
  })

  it('drops the note when there is no room for it', () => {
    const address = 'A'.repeat(495)
    expect(addressWithSizes(address, lines, 500)).toBe(address)
  })
})

describe('wishlist', () => {
  it('toggles ids and persists them', () => {
    const storage = memoryStorage()
    let ids = toggleWishlist([], 5)
    ids = toggleWishlist(ids, 7)
    ids = toggleWishlist(ids, 5)
    saveWishlist(ids, storage)

    expect(loadWishlist(storage)).toEqual([7])
  })

  it('ignores junk and blocked storage', () => {
    const junk = memoryStorage()
    junk.setItem('shopflow.wishlist', '["x", 3, 1.5, 4]')
    expect(loadWishlist(junk)).toEqual([3, 4])
    expect(loadWishlist(brokenStorage())).toEqual([])
  })
})

describe('theme preference', () => {
  it('stores only light or dark', () => {
    const storage = memoryStorage()
    expect(storedTheme(storage)).toBeNull() // no choice: follow the system
    saveTheme('dark', storage)
    expect(storedTheme(storage)).toBe('dark')
    storage.setItem('shopflow.theme', '"purple"')
    expect(storedTheme(storage)).toBeNull()
  })
})

describe('avatar initials', () => {
  it('uses the first letters of the name parts, or the first two letters', () => {
    expect(initialsFromEmail('asha.rao@example.com')).toBe('AR')
    expect(initialsFromEmail('lakshay@example.com')).toBe('LA')
    expect(initialsFromEmail('storefront-3be1a2@example.com')).toBe('ST') // digits aren't initials
    expect(initialsFromEmail('a@example.com')).toBe('A')
    expect(initialsFromEmail('@example.com')).toBe('?')
  })
})

describe('safeNextPath', () => {
  it('allows paths inside the site', () => {
    expect(safeNextPath('/cart')).toBe('/cart')
    expect(safeNextPath('/products/7?x=1')).toBe('/products/7?x=1')
  })

  it('refuses other sites and junk', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '', null]) {
      expect(safeNextPath(bad)).toBe('/')
    }
  })
})

describe('stock levels', () => {
  it('keeps the indigo / turmeric / madder thresholds', () => {
    expect([42, 6, 5, 1, 0].map(stockLevel)).toEqual(['plenty', 'plenty', 'low', 'low', 'out'])
    expect([42, 3, 0].map(stockLabel)).toEqual(['42 left', 'Only 3 left', 'Sold out'])
  })
})

describe('password checklist', () => {
  it('enforces only the length rules the backend enforces', () => {
    expect(passwordAcceptable('short')).toBe(false)
    expect(passwordAcceptable('longenough')).toBe(true)
    expect(passwordAcceptable('x'.repeat(129))).toBe(false)
  })

  it('reports which suggestions are met', () => {
    const met = Object.fromEntries(passwordChecks('Indigo-2026').map((c) => [c.label, c.met]))
    expect(met).toEqual({
      'At least 8 characters': true,
      'A number or a symbol': true,
      'Upper and lower case letters': true,
      '16 characters or more (even better)': false,
    })
  })
})
