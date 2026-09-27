import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import * as api from '../api/endpoints'
import type { Product } from '../api/types'
import { ErrorNotice, Loading, Pager, StockNumber, fieldLabel, primaryButton, quietButton, textInput } from '../components/ui'
import { formatPaise, parseRupeesToPaise } from '../lib/money'
import { asApiError, useApi } from '../lib/useApi'

const PAGE_SIZE = 20
const SKU_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/ // same rule as the backend
const MAX_PRICE_PAISE = 100_000_000 // ₹10,00,000
const MAX_STOCK = 1_000_000

export function AdminProductsPage() {
  const [params, setParams] = useSearchParams()
  const offset = Number(params.get('offset') ?? 0) || 0
  const products = useApi(() => api.listProducts({ include_inactive: true, limit: PAGE_SIZE, offset }), [offset])

  function replace(updated: Product) {
    if (products.data) products.setData({ ...products.data, items: products.data.items.map((p) => (p.id === updated.id ? updated : p)) })
  }

  return (
    <section>
      <h1 className="text-5xl">Manage products</h1>
      <NewProductForm onCreated={() => (offset === 0 ? products.reload() : setParams({}))} />
      <h2 className="mt-10 text-3xl">All products</h2>
      <p className="text-sm text-slate">Hidden products stay in past orders but can’t be bought.</p>
      <div className="mt-4">
        {products.error && <ErrorNotice error={products.error} />}
        {products.loading && !products.data && <Loading what="products" />}
        {products.data && (
          <>
            <ul className="border-t border-rule">
              {products.data.items.map((p) => <AdminRow key={p.id} product={p} onChange={replace} />)}
            </ul>
            <Pager total={products.data.total} limit={PAGE_SIZE} offset={offset} onChange={(next) => setParams({ offset: String(next) })} />
          </>
        )}
      </div>
    </section>
  )
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const empty = { sku: '', name: '', price: '', stock: '0', description: '' }
  const [form, setForm] = useState(empty)
  const [problem, setProblem] = useState<string>()
  const [created, setCreated] = useState<string>()
  const [saving, setSaving] = useState(false)
  const field = (key: keyof typeof empty) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    setCreated(undefined)
    const sku = form.sku.trim().toUpperCase()
    const pricePaise = parseRupeesToPaise(form.price)
    const stock = Number(form.stock)
    const invalid =
      !SKU_PATTERN.test(sku) || sku.length < 3 ? 'SKU: 3 or more letters and digits in hyphen-separated groups, like TSHIRT-BLK-M.'
      : !form.name.trim() ? 'Enter a product name.'
      : pricePaise === null || pricePaise <= 0 || pricePaise > MAX_PRICE_PAISE ? 'Price: an amount in rupees between ₹0.01 and ₹10,00,000, like 499 or 499.50.'
      : !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK ? 'Starting stock: a whole number from 0 to 10,00,000.'
      : undefined
    setProblem(invalid)
    if (invalid) return

    setSaving(true)
    try {
      const product = await api.createProduct({
        sku, name: form.name.trim(), description: form.description.trim(), price_paise: pricePaise!, initial_stock: stock,
      })
      setForm(empty)
      setCreated(`Added ${product.name} (${product.sku}).`)
      onCreated()
    } catch (e) {
      const error = asApiError(e)
      setProblem(error.code === 'SKU_ALREADY_EXISTS' ? `SKU ${sku} is already used by another product.` : error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 grid gap-4 border border-rule bg-surface p-5 sm:grid-cols-2">
      <h2 className="text-2xl sm:col-span-2">Add a product</h2>
      <div><label htmlFor="sku" className={fieldLabel}>SKU</label><input id="sku" className={textInput} {...field('sku')} /></div>
      <div><label htmlFor="name" className={fieldLabel}>Name</label><input id="name" className={textInput} {...field('name')} /></div>
      <div><label htmlFor="price" className={fieldLabel}>Price (₹)</label><input id="price" inputMode="decimal" className={textInput} {...field('price')} /></div>
      <div><label htmlFor="stock" className={fieldLabel}>Starting stock</label><input id="stock" type="number" min={0} className={textInput} {...field('stock')} /></div>
      <div className="sm:col-span-2"><label htmlFor="description" className={fieldLabel}>Description (optional)</label>
        <textarea id="description" rows={2} className={textInput} {...field('description')} /></div>
      <div className="space-y-2 sm:col-span-2">
        <ErrorNotice error={problem} />
        {created && <p role="status" className="text-indigo">{created}</p>}
        <button type="submit" className={primaryButton} disabled={saving}>{saving ? 'Adding…' : 'Add product'}</button>
      </div>
    </form>
  )
}

function AdminRow({ product, onChange }: { product: Product; onChange: (p: Product) => void }) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState((product.price_paise / 100).toFixed(2))
  const [units, setUnits] = useState('10')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<Product>) {
    setBusy(true)
    setError(undefined)
    try {
      onChange(await action())
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const savePrice = () => {
    const paise = parseRupeesToPaise(price)
    if (paise === null || paise <= 0 || paise > MAX_PRICE_PAISE) return setError('Enter a price like 499 or 499.50.')
    run(() => api.updateProduct(product.id, { price_paise: paise }))
  }
  const addStock = () => {
    const n = Number(units)
    if (!Number.isInteger(n) || n <= 0 || n > MAX_STOCK) return setError('Enter a whole number of units to add.')
    run(async () => {
      await api.restock(product.id, n)
      return api.getProduct(product.id)
    })
  }
  const toggleVisibility = () =>
    run(async () => {
      if (product.is_active) await api.deactivateProduct(product.id)
      else await api.updateProduct(product.id, { is_active: true })
      return api.getProduct(product.id)
    })

  return (
    <li className={`border-b border-rule bg-surface px-4 py-4 ${product.is_active ? '' : 'opacity-70'}`}>
      <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-x-6 gap-y-2">
        <StockNumber quantity={product.stock_quantity} />
        <div className="min-w-0">
          <p className="font-semibold">{product.name}{!product.is_active && <span className="ml-2 text-sm font-normal text-slate">Hidden from shop</span>}</p>
          <p className="text-sm text-slate">{product.sku}, {formatPaise(product.price_paise)}</p>
        </div>
        <button className={quietButton} onClick={() => setEditing(!editing)} aria-expanded={editing}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-4 pl-0 sm:pl-[6.5rem]">
          <div>
            <label htmlFor={`price-${product.id}`} className={fieldLabel}>Price (₹)</label>
            <div className="flex gap-2">
              <input id={`price-${product.id}`} inputMode="decimal" className={`${textInput} w-28`} value={price} onChange={(e) => setPrice(e.target.value)} />
              <button className={quietButton} onClick={savePrice} disabled={busy}>Save price</button>
            </div>
          </div>
          <div>
            <label htmlFor={`units-${product.id}`} className={fieldLabel}>Units to add</label>
            <div className="flex gap-2">
              <input id={`units-${product.id}`} type="number" min={1} className={`${textInput} w-24`} value={units} onChange={(e) => setUnits(e.target.value)} />
              <button className={quietButton} onClick={addStock} disabled={busy}>Add stock</button>
            </div>
          </div>
          <button className={quietButton} onClick={toggleVisibility} disabled={busy}>
            {product.is_active ? 'Hide from shop' : 'Show in shop'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-madder" role="alert">{error}</p>}
    </li>
  )
}
