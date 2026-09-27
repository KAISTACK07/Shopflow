import { useState } from 'react'
import { Link, useParams } from 'react-router'
import * as api from '../api/endpoints'
import { ErrorNotice, Loading, StockNumber, fieldLabel, textInput } from '../components/ui'
import { formatPaise } from '../lib/money'
import { useApi } from '../lib/useApi'
import { AddToCart } from './ProductsPage'

const MAX_PER_ORDER = 100 // same cap as the backend's cart line limit

export function ProductPage() {
  const id = Number(useParams().id)
  const product = useApi(() => api.getProduct(id), [id])
  const [quantity, setQuantity] = useState(1)

  if (product.error) {
    return (
      <ErrorNotice error={product.error.code === 'PRODUCT_NOT_FOUND' ? 'This product isn’t for sale any more.' : product.error}>
        <Link to="/" className="text-indigo underline">Back to all products</Link>
      </ErrorNotice>
    )
  }
  if (!product.data) return <Loading what="product" />

  const p = product.data
  const max = Math.max(1, Math.min(MAX_PER_ORDER, p.stock_quantity))
  return (
    <article>
      <Link to="/" className="text-sm text-indigo underline">All products</Link>
      <div className="mt-4 grid gap-8 border border-rule bg-surface p-6 sm:grid-cols-[1fr_12rem]">
        <div>
          <h1 className="text-5xl">{p.name}</h1>
          <p className="mt-1 text-slate">{p.sku}</p>
          <p className="mt-4 text-2xl font-semibold">{formatPaise(p.price_paise)}</p>
          {p.description && <p className="mt-4 max-w-prose whitespace-pre-line">{p.description}</p>}
        </div>
        <div className="space-y-4">
          <StockNumber quantity={p.stock_quantity} size="hero" />
          {p.stock_quantity > 0 && (
            <div>
              <label htmlFor="quantity" className={fieldLabel}>Quantity</label>
              <input id="quantity" type="number" min={1} max={max} className={textInput} value={quantity}
                onChange={(e) => setQuantity(Math.min(max, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
            </div>
          )}
          <AddToCart product={p} quantity={quantity} />
        </div>
      </div>
    </article>
  )
}
