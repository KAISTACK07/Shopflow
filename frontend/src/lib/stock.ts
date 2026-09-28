// Scarcity levels shared by every stock badge and numeral: indigo = plenty, turmeric = low, madder = sold out.

export const LOW_STOCK_AT = 5 // the shop-wide default low-stock threshold on the backend

export type StockLevel = 'plenty' | 'low' | 'out'

export function stockLevel(quantity: number): StockLevel {
  return quantity <= 0 ? 'out' : quantity <= LOW_STOCK_AT ? 'low' : 'plenty'
}

/** "Sold out", "Only 3 left" (low stock gets "Only"), or "42 left". */
export function stockLabel(quantity: number): string {
  const level = stockLevel(quantity)
  return level === 'out' ? 'Sold out' : level === 'low' ? `Only ${quantity} left` : `${quantity} left`
}
