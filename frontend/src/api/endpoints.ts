// One function per backend endpoint the UI uses.

import { request, send } from './client'
import type { Cart, Order, Page, Product, User } from './types'

const query = (params: Record<string, string | number | boolean | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : ''
}

// --- auth ---
export const login = (email: string, password: string) =>
  request<{ access_token: string; expires_in: number }>('/auth/login', { method: 'POST', body: { email, password } })
export const register = (email: string, password: string) =>
  request<User>('/auth/register', { method: 'POST', body: { email, password } })
export const me = () => request<User>('/auth/me')

// --- products ---
export interface ProductQuery {
  q?: string
  limit?: number
  offset?: number
  include_inactive?: boolean
}
export const listProducts = (params: ProductQuery) => request<Page<Product>>(`/products${query({ ...params })}`)
export const getProduct = (id: number) => request<Product>(`/products/${id}`)
export const createProduct = (body: {
  sku: string
  name: string
  description: string
  price_paise: number
  initial_stock: number
}) => request<Product>('/products', { method: 'POST', body })
export const updateProduct = (id: number, body: Partial<Pick<Product, 'name' | 'description' | 'price_paise' | 'is_active'>>) =>
  request<Product>(`/products/${id}`, { method: 'PATCH', body })
export const deactivateProduct = (id: number) => request<null>(`/products/${id}`, { method: 'DELETE' })
export const restock = (productId: number, delta: number) =>
  request<unknown>(`/inventory/${productId}`, { method: 'PATCH', body: { delta, reason: 'restock' } })

// --- cart ---
export const getCart = () => request<Cart>('/cart')
export const addToCart = (productId: number, quantity: number) =>
  request<Cart>('/cart/items', { method: 'POST', body: { product_id: productId, quantity } })
export const setCartQuantity = (productId: number, quantity: number) =>
  request<Cart>(`/cart/items/${productId}`, { method: 'PATCH', body: { quantity } })
export const removeFromCart = (productId: number) => request<Cart>(`/cart/items/${productId}`, { method: 'DELETE' })

// --- orders ---
export async function placeOrder(shippingAddress: string, idempotencyKey: string) {
  const { data, headers } = await send<Order>('/orders', {
    method: 'POST',
    body: { shipping_address: shippingAddress },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  return { order: data, replayed: headers.get('Idempotent-Replayed') === 'true' }
}
export const listOrders = (params: { limit?: number; offset?: number }) =>
  request<Page<Order>>(`/orders${query({ ...params })}`)
export const cancelOrder = (id: number) => request<Order>(`/orders/${id}/cancel`, { method: 'POST' })
