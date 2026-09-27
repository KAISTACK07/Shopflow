// The API speaks integer paise (₹1 = 100 paise). Rupees exist only on screen.

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

export function formatPaise(paise: number): string {
  return rupees.format(paise / 100)
}

const RUPEE_INPUT = /^(\d+)(?:\.(\d{1,2}))?$/

/**
 * "499" → 49900, "19.99" → 1999, "1,499.5" → 149950. Returns null for anything that isn't a plain
 * non-negative amount with at most 2 decimals.
 *
 * Done with string arithmetic on purpose: Math.round(parseFloat("19.99") * 100) happens to work, but
 * 19.99 * 100 is 1998.9999999999998 in JavaScript, and truncating code (or a different number) gets it wrong.
 */
export function parseRupeesToPaise(input: string): number | null {
  const match = RUPEE_INPUT.exec(input.trim().replaceAll(',', ''))
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
