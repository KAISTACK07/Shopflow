import { describe, expect, it } from 'vitest'
import { formatPaise, parseRupeesToPaise } from './money'

describe('parseRupeesToPaise', () => {
  it.each([
    ['499', 49900],
    ['499.5', 49950],
    ['499.50', 49950],
    ['0.01', 1],
    ['19.99', 1999], // 19.99 * 100 === 1998.9999999999998 in floating point
    ['1,499.00', 149900],
    ['  250 ', 25000],
  ])('parses %j as %i paise', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected)
  })

  it.each(['', 'abc', '1.234', '-5', '4 99', '1e3', '.5'])('rejects %j', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull()
  })

  it('shows why string arithmetic is used', () => {
    expect(19.99 * 100).not.toBe(1999)
  })
})

describe('formatPaise', () => {
  it('formats paise as rupees with Indian digit grouping', () => {
    expect(formatPaise(12345678)).toBe('₹1,23,456.78')
  })
})
