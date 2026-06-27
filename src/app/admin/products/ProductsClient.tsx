'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { Product } from '@/lib/types'

// ─── helpers ────────────────────────────────────────────────────────────────

type Fields = {
  name: string
  price: string       // stored as string so <input type="number"> stays controlled
  description: string
  stock: string
  image_url: string
}

function toFields(p: Product): Fields {
  return {
    name: p.name,
    price: (p.price / 100).toFixed(2),   // paise → rupees for display
    description: p.description ?? '',
    stock: String(p.stock),
    image_url: p.image_url ?? '',
  }
}

function isDirty(f: Fields, p: Product): boolean {
  return (
    f.name.trim() !== p.name ||
    parseFloat(f.price) * 100 !== p.price ||
    (f.description || null) !== (p.description || null) ||
    parseInt(f.stock, 10) !== p.stock ||
    (f.image_url || null) !== (p.image_url || null)
  )
}

// ─── image upload zone ───────────────────────────────────────────────────────

function ImageZone({
  imageUrl,
  slug,
  onUploaded,
}: {
  imageUrl: string
  slug: string
  onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('slug', slug)
    const res = await fetch('/api/admin/upload-image', { method: 'POST', body: form })
    const json = await res.json() as { url?: string; error?: string }
    if (json.url) onUploaded(json.url)
    else alert('Upload failed: ' + (json.error ?? 'unknown error'))
    setUploading(false)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  function handleUrlSubmit() {
    const url = urlInput.trim()
    if (url) { onUploaded(url); setUrlInput('') }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative w-full aspect-square rounded-lg border-2 border-dashed cursor-pointer overflow-hidden transition-colors
          ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-xs text-center px-2">Click or drag to replace</p>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3">
            {uploading ? (
              <p className="text-xs text-gray-500">Uploading…</p>
            ) : (
              <>
                <svg className="w-8 h-8 text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-400 text-center">Drop image or click to upload</p>
              </>
            )}
          </div>
        )}
        {uploading && imageUrl && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <p className="text-xs text-gray-600">Uploading…</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex gap-1">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          placeholder="Or paste image URL"
          className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={handleUrlSubmit}
          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200 whitespace-nowrap transition-colors"
        >
          Use URL
        </button>
      </div>
    </div>
  )
}

// ─── product card ────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onUpdate,
  onDelete,
}: {
  product: Product
  onUpdate: (p: Product) => void
  onDelete: (id: string) => void
}) {
  const [fields, setFields] = useState<Fields>(toFields(product))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [flash, setFlash] = useState('')
  const dirty = isDirty(fields, product)

  function set(key: keyof Fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/admin/update-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: product.id,
        name: fields.name.trim(),
        price: parseFloat(fields.price),
        description: fields.description.trim() || null,
        stock: parseInt(fields.stock, 10),
        image_url: fields.image_url.trim() || null,
      }),
    })
    const json = await res.json() as { product?: Product; error?: string }
    if (json.product) { onUpdate(json.product); showFlash('Saved') }
    else showFlash('Error: ' + (json.error ?? 'unknown'))
    setSaving(false)
  }

  async function handleToggle() {
    const res = await fetch('/api/admin/update-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, is_active: !product.is_active }),
    })
    const json = await res.json() as { product?: Product }
    if (json.product) onUpdate(json.product)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${product.name}"?\n\nThis cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch('/api/admin/delete-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id }),
    })
    const json = await res.json() as { ok?: boolean; error?: string; suggestion?: string }
    if (json.ok) {
      onDelete(product.id)
    } else {
      alert((json.error ?? 'Delete failed') + (json.suggestion ? '\n\n' + json.suggestion : ''))
      setDeleting(false)
    }
  }

  async function handleImageUploaded(url: string) {
    set('image_url', url)
    const res = await fetch('/api/admin/update-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, image_url: url }),
    })
    const json = await res.json() as { product?: Product }
    if (json.product) onUpdate(json.product)
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 transition-opacity ${!product.is_active ? 'opacity-60' : ''}`}>
      <div className="flex gap-4">
        {/* Image — left */}
        <div className="w-36 shrink-0">
          <ImageZone imageUrl={fields.image_url} slug={product.slug} onUploaded={handleImageUploaded} />
        </div>

        {/* Fields — right */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div>
            <label className="text-xs text-gray-400">Name</label>
            <input
              value={fields.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full text-sm font-medium border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-0.5 bg-transparent"
            />
          </div>

          <p className="text-xs text-gray-300">slug: {product.slug}</p>

          <div className="flex gap-4">
            <div>
              <label className="text-xs text-gray-400">Price (₹)</label>
              <input
                type="number"
                value={fields.price}
                onChange={(e) => set('price', e.target.value)}
                step="0.01"
                min="0"
                className="w-24 text-sm border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-0.5 bg-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Stock</label>
              <input
                type="number"
                value={fields.stock}
                onChange={(e) => set('stock', e.target.value)}
                min="0"
                className="w-20 text-sm border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-0.5 bg-transparent"
              />
            </div>
          </div>

          <div className="flex-1">
            <label className="text-xs text-gray-400">Description</label>
            <textarea
              value={fields.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="w-full text-sm border border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none rounded p-1 resize-none bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={handleToggle}
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
            product.is_active
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
          {product.is_active ? 'Active — visible on site' : 'Inactive — hidden from site'}
        </button>

        <div className="flex items-center gap-2">
          {flash && (
            <span className={`text-xs ${flash.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {flash}
            </span>
          )}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Checking…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── add product form ────────────────────────────────────────────────────────

function AddProductForm({ onAdded }: { onAdded: (p: Product) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState({ name: '', price: '', description: '', stock: '0' })

  function set(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCreate() {
    if (!fields.name.trim() || !fields.price) { setError('Name and price are required'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/create-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fields.name.trim(),
        price: parseFloat(fields.price),
        description: fields.description.trim() || undefined,
        stock: parseInt(fields.stock, 10),
        is_active: false,
      }),
    })
    const json = await res.json() as { product?: Product; error?: string }
    if (json.product) {
      onAdded(json.product)
      setFields({ name: '', price: '', description: '', stock: '0' })
      setOpen(false)
    } else {
      setError(json.error ?? 'Failed to create product')
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
      >
        + Add new product
      </button>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <p className="text-xs text-blue-700 font-medium mb-3">
        New product — saved as <strong>Inactive</strong> until you activate it. Upload image after creating.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500">Product name *</label>
          <input
            value={fields.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Stethoscope Keychain"
            autoFocus
            className="w-full mt-0.5 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Price (₹) *</label>
          <input
            type="number"
            value={fields.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder="199"
            min="0"
            step="0.01"
            className="w-full mt-0.5 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Stock quantity</label>
          <input
            type="number"
            value={fields.stock}
            onChange={(e) => set('stock', e.target.value)}
            min="0"
            className="w-full mt-0.5 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500">Description</label>
          <textarea
            value={fields.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder="Short product description shown to customers"
            className="w-full mt-0.5 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 text-gray-500 hover:text-gray-700">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Creating…' : 'Create product'}
        </button>
      </div>
    </div>
  )
}

// ─── main export ─────────────────────────────────────────────────────────────

export function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts)

  function handleUpdate(updated: Product) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  function handleDelete(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  function handleAdded(product: Product) {
    setProducts((prev) => [product, ...prev])
  }

  const active = products.filter((p) => p.is_active)
  const inactive = products.filter((p) => !p.is_active)

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">PostDuty — Products</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {active.length} active · {inactive.length} inactive
        </p>
      </div>

      <div className="mb-6">
        <AddProductForm onAdded={handleAdded} />
      </div>

      {active.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Active — visible on site</p>
          <div className="space-y-3">
            {active.map((p) => (
              <ProductCard key={p.id} product={p} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Staged — hidden from site</p>
          <div className="space-y-3">
            {inactive.map((p) => (
              <ProductCard key={p.id} product={p} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {products.length === 0 && (
        <p className="text-center text-gray-300 py-16 text-sm">No products yet. Add one above.</p>
      )}
    </div>
  )
}
