// Mirrors the backend's response schemas (see /docs on the API).

export type Role = 'customer' | 'admin'
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'cancelled'

export interface User {
  id: number
  email: string
  role: Role
  created_at: string
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface Product {
  id: number
  sku: string
  name: string
  description: string
  price_paise: number
  is_active: boolean
  stock_quantity: number
  created_at: string
  updated_at: string
}

export interface CartItem {
  product_id: number
  sku: string
  name: string
  unit_price_paise: number
  quantity: number
  line_total_paise: number
  available_quantity: number
  is_available: boolean
}

export interface Cart {
  items: CartItem[]
  total_quantity: number
  subtotal_paise: number
  has_unavailable_items: boolean
}

export interface OrderItem {
  product_id: number
  sku: string
  name: string
  quantity: number
  unit_price_paise: number
  line_total_paise: number
}

export interface Order {
  id: number
  user_id: number
  status: OrderStatus
  total_paise: number
  shipping_address: string
  items: OrderItem[]
  created_at: string
  updated_at: string
}

/** One entry of a 409 INSUFFICIENT_STOCK error's details. */
export interface StockProblem {
  product_id: number
  requested: number
  available: number
  reason?: 'insufficient_stock' | 'product_unavailable'
}
