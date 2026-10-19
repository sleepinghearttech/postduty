'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { OwnerProduct, ProductCommerce as Commerce, ProductMedia as Media, ProductVariant as Variant } from '@/lib/types'
import styles from './ProductsClient.module.css'
import { GST_RATES_BPS } from '@/lib/product-validation'
import { useSearchParams } from 'next/navigation'

type VariantField = Omit<Variant, 'price' | 'stock'> & { price: string; stock: string }
type Fields = {
  name: string; slug: string; price: string; description: string; stock: string; creator_id: string;
  customisation_note: string; collections_text: string; tags_text: string; commerce: Commerce; operations: Record<string, unknown>; variants: VariantField[];
}
type Tab = 'basics' | 'media' | 'pricing' | 'inventory' | 'details'
type Action = 'publish' | 'unpublish' | 'archive' | 'duplicate'
const tabs: { id: Tab; label: string }[] = [
  { id: 'basics', label: 'Basics' }, { id: 'media', label: 'Photos & video' },
  { id: 'pricing', label: 'Pricing' }, { id: 'inventory', label: 'Stock & options' }, { id: 'details', label: 'Details' },
]
const categories = ['Healthcare-worker gifts', 'Clinical accessories', 'Medical-themed accessories', '3D-printed products', 'Crochet', 'Handmade crafts', 'Home décor', 'Personalized gifts', 'Christmas decorations', 'Christmas gifts', 'Lanterns & lighting', 'Gift bundles']
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100)
const list = (value: string) => value.split(',').map(s => s.trim()).filter(Boolean)
const status = (p: OwnerProduct) => p.commerce?.archived ? 'Archived' : p.is_active ? 'Published' : 'Draft'
const storefronts = (p: OwnerProduct) => p.commerce?.storefronts ?? ['general']
const stringify = (value: unknown) => JSON.stringify(value)

function makeFields(product?: OwnerProduct): Fields {
  const media = product?.commerce?.media?.length ? product.commerce.media : product?.image_url ? [{ url: product.image_url, type: 'image' as const, alt: product.name }] : []
  return {
    name: product?.name ?? '', slug: product?.slug ?? '', price: product ? String(product.price / 100) : '',
    description: product?.description ?? '', stock: String(product?.stock ?? 0), creator_id: product?.creator_id ?? '',
    customisation_note: product?.customisation_note ?? '', collections_text: (product?.commerce?.collections ?? []).join(', '), tags_text: (product?.commerce?.tags ?? []).join(', '),
    commerce: { storefronts: product ? storefronts(product) : ['christmas'], ...product?.commerce, media },
    operations: { license_status: 'unverified', ...product?.operations },
    variants: (product?.commerce?.variants ?? []).map(v => ({ ...v, price: String(v.price / 100), stock: String(v.stock) })),
  }
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`${styles.field} ${wide ? styles.wide : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return <section className={styles.section}><h3>{title}</h3>{note && <p className={styles.note}>{note}</p>}<div className={styles.grid}>{children}</div></section>
}
function ProductImage({ product }: { product: OwnerProduct }) {
  const photo = product.commerce?.media?.find(m => m.type === 'image')?.url ?? product.image_url
  return photo ? <img className={styles.thumb} src={photo} alt="" /> : <span className={styles.placeholder} aria-hidden="true">P</span> // eslint-disable-line @next/next/no-img-element
}

function ProductEditor({ product, sandbox, onSaved, onClose, catalog = [] }: {
  catalog?: OwnerProduct[];
  product?: OwnerProduct; sandbox: boolean; onSaved: (product: OwnerProduct) => void; onClose: () => void;
}) {
  const [saved, setSaved] = useState(product)
  const [fields, setFields] = useState(() => makeFields(product))
  const [baseline, setBaseline] = useState(() => stringify(makeFields(product)))
  const [tab, setTab] = useState<Tab>('basics')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [creatorChoices, setCreatorChoices] = useState<{ id: string; display_name: string; status: string }[] | null>(null)
  const [creatorError, setCreatorError] = useState('')
  const filesRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const dirty = stringify(fields) !== baseline
  const busy = pending !== null
  const media = fields.commerce.media ?? []
  const price = Number(fields.price || 0)

  useEffect(() => {
    if (!dirty && !busy) return
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a') : null
      if (!target || target.target === '_blank' || target.hasAttribute('download') || !target.href || target.href === window.location.href || event.metaKey || event.ctrlKey) return
      if (busy || !window.confirm('You have unsaved product changes. Leave and discard them?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', leave)
    document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', navigate, true) }
  }, [dirty, busy])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/creators', { signal: controller.signal })
      .then(async response => {
        const result = await response.json() as { creators?: { id: string; display_name: string; status: string }[]; error?: string }
        if (!response.ok || !Array.isArray(result.creators)) throw new Error(result.error || 'Creator list is unavailable.')
        setCreatorChoices(result.creators)
      })
      .catch(caught => { if (!controller.signal.aborted) { setCreatorChoices([]); setCreatorError(caught instanceof Error ? caught.message : 'Creator list is unavailable.') } })
    return () => controller.abort()
  }, [])

  function set<K extends keyof Fields>(key: K, value: Fields[K]) { setFields(prev => ({ ...prev, [key]: value })); setMessage('') }
  function commerce<K extends keyof Commerce>(key: K, value: Commerce[K]) { setFields(prev => ({ ...prev, commerce: { ...prev.commerce, [key]: value } })); setMessage('') }
  function operation(key: string, value: unknown) { setFields(prev => ({ ...prev, operations: { ...prev.operations, [key]: value } })); setMessage('') }
  function op(key: string) { const value = fields.operations[key]; return typeof value === 'number' || typeof value === 'string' ? String(value) : '' }
  function num(value: string) { return value === '' ? undefined : Number(value) }
  function close() { if (!busy && (!dirty || window.confirm('Discard your unsaved product changes?'))) onClose() }
  function fail(value: string) { setError(value); requestAnimationFrame(() => noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })) }

  function validation(action?: Action): string | null {
    if (!fields.name.trim()) { setTab('basics'); return 'Add a product name before saving.' }
    if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100)) || Math.abs(Math.round(price * 100) - price * 100) > 0.00001) { setTab('pricing'); return 'Enter a valid price in rupees.' }
    if (!Number.isInteger(Number(fields.stock)) || Number(fields.stock) < 0) { setTab('inventory'); return 'Stock must be a whole number of zero or more.' }
    if (fields.variants.some(v => !v.name.trim() || !v.price.trim() || !v.stock.trim() || !Number.isFinite(Number(v.price)) || Number(v.price) < 0 || Math.abs(Math.round(Number(v.price) * 100) - Number(v.price) * 100) > 0.00001 || !Number.isInteger(Number(v.stock)) || Number(v.stock) < 0)) { setTab('inventory'); return 'Every variant needs a name, a valid price and whole-number stock.' }
    if (Object.values(costs).some(value => value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) { setTab('pricing'); return 'Recorded costs must be zero or greater.' }
    if (op('commission_percent') && (Number(op('commission_percent')) < 0 || Number(op('commission_percent')) > 100)) { setTab('pricing'); return 'Commission must be between 0% and 100%.' }
    if (action === 'publish') {
      if (price <= 0) { setTab('pricing'); return 'Set an approved selling price greater than zero before publishing.' }
      if (!(fields.commerce.storefronts ?? []).length) { setTab('basics'); return 'Choose at least one storefront.' }
      if (!media.some(m => m.type === 'image')) { setTab('media'); return 'Add at least one product photo before publishing.' }
      if (!['owned', 'commercial_license', 'permission_verified', 'not_required'].includes(op('license_status'))) { setTab('details'); return 'Verify the commercial design rights before publishing.' }
      if (fields.commerce.archived) return 'This product is archived. Duplicate it to create a new draft.'
    }
    return null
  }

  async function persist(action?: Action) {
    if (busyRef.current) return
    const invalid = validation(action)
    if (invalid) { fail(invalid); return }
    if (action === 'publish' && !window.confirm(`${sandbox ? 'Publish this fictional product in the test storefront' : 'Publish this product on its selected storefronts'}? Your current edits will be saved.`)) return
    if (action === 'archive' && !window.confirm('Archive this product and remove it from the storefronts? Historical orders will be preserved.')) return
    busyRef.current = true
    setPending(action ?? 'save'); setError(''); setMessage('')
    try {
      const payload = {
        ...(saved ? { id: saved.id, updated_at: saved.updated_at } : {}), name: fields.name.trim(), slug: fields.slug.trim() || undefined,
        price, stock: Number(fields.stock), description: fields.description.trim() || null,
        image_url: media.find(m => m.type === 'image')?.url ?? null,
        customisation_note: fields.customisation_note.trim() || null, creator_id: fields.creator_id.trim() || null,
        commerce: { ...fields.commerce, collections: list(fields.collections_text), tags: list(fields.tags_text), variants: fields.variants.map(v => ({ ...v, name: v.name.trim(), price: Math.round(Number(v.price) * 100), stock: Number(v.stock) })) },
        operations: fields.operations, ...(action ? { action } : {}),
      }
      const response = await fetch(`/api/admin/${saved ? 'update-product' : 'create-product'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => null) as { product?: OwnerProduct; error?: string } | null
      if (!response.ok || !data?.product) throw new Error(data?.error || (response.status === 401 || response.status === 403 ? 'Your owner session has expired or access was denied. Your edits remain here; sign in again in another tab, then retry.' : `The product could not be saved (${response.status}). Your edits remain here.`))
      const next = makeFields(data.product)
      setSaved(data.product); setFields(next); setBaseline(stringify(next)); onSaved(data.product)
      setMessage(action === 'duplicate' ? 'A new draft copy is ready to edit. Its stock is reset to zero; add inventory only when available.' : action === 'publish' ? 'Published. The selected storefronts use these saved details.' : action === 'unpublish' ? 'Unpublished. This product is now a private draft.' : action === 'archive' ? 'Archived. Order history is preserved.' : data.product.is_active ? 'Changes saved to the published product.' : 'Draft saved. It is not visible to customers.')
    } catch (caught) { fail(caught instanceof Error ? caught.message : 'Connection failed. Your edits are still here. Please retry.') }
    finally { setPending(null); busyRef.current = false }
  }

  async function upload(files: FileList | File[]) {
    if (busyRef.current) return
    const selected = Array.from(files)
    if (!selected.length) return
    if (media.length + selected.length > 12) { fail('A product can have up to 12 media files. Remove a file before adding more.'); return }
    if (media.filter(m => m.type === 'video').length + selected.filter(f => f.type.startsWith('video/')).length > 2) { fail('A product can have up to two videos.'); return }
    const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
    if (selected.some(f => !supported.includes(f.type))) { fail('Use JPEG, PNG, WebP or GIF photos, or MP4/WebM videos.'); return }
    if (selected.some(f => f.size > (f.type.startsWith('video/') ? 25 : 8) * 1024 * 1024)) { fail('Photos must be 8 MB or smaller, and videos 25 MB or smaller.'); return }
    busyRef.current = true; setPending('upload'); setError(''); setMessage('')
    let completed = 0
    try {
      for (const file of selected) {
        setUploadProgress(`Uploading ${completed + 1} of ${selected.length}: ${file.name}`)
        const body = new FormData(); body.append('file', file); body.append('slug', fields.slug || 'draft')
        const response = await fetch('/api/admin/upload-image', { method: 'POST', body })
        const data = await response.json().catch(() => null) as { url?: string; type?: 'image' | 'video'; error?: string } | null
        if (!response.ok || !data?.url) throw new Error(data?.error || `Upload failed for ${file.name}. Please retry.`)
        const item: Media = { url: data.url, type: data.type ?? (file.type.startsWith('video/') ? 'video' : 'image'), alt: fields.name.trim() }
        setFields(prev => ({ ...prev, commerce: { ...prev.commerce, media: [...(prev.commerce.media ?? []), item] } }))
        completed++
      }
      setMessage(`${completed} file${completed === 1 ? '' : 's'} uploaded. Save the product to attach them to the listing.`)
    } catch (caught) { fail(`${completed ? `${completed} file(s) uploaded successfully. ` : ''}${caught instanceof Error ? caught.message : 'Upload failed. Please retry the remaining files.'}`) }
    finally { setPending(null); setUploadProgress(''); busyRef.current = false }
  }
  function updateMedia(index: number, update: Partial<Media>) { commerce('media', media.map((m, i) => i === index ? { ...m, ...update } : m)) }
  function moveMedia(index: number, nextIndex: number) { const next = [...media]; const [item] = next.splice(index, 1); next.splice(nextIndex, 0, item); commerce('media', next) }
  function updateVariant(index: number, update: Partial<VariantField>) { set('variants', fields.variants.map((v, i) => i === index ? { ...v, ...update } : v)) }
  function toggleStore(value: 'general' | 'christmas') { const selected = fields.commerce.storefronts ?? []; commerce('storefronts', selected.includes(value) ? selected.filter(s => s !== value) : [...selected, value]) }

  const costs = fields.operations.costs_rupees && typeof fields.operations.costs_rupees === 'object' ? fields.operations.costs_rupees as Record<string, unknown> : {}
  const costLabels = [ ['materials', 'Materials'], ['labor', 'Labor'], ['packaging', 'Packaging'], ['shipping', 'Shipping'], ['electricity', 'Electricity'], ['hardware', 'Hardware'], ['failure_allowance', 'Failure allowance'], ['payment_fees', 'Payment fees'], ['taxes', 'Taxes'], ['creator_payment', 'Creator payment'] ]
  const validCost = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  const recordedCosts = Object.values(costs).filter(validCost).reduce<number>((sum, value) => sum + Number(value), 0)
  const completeCosts = costLabels.every(([key]) => validCost(costs[key]))
  const contribution = price - recordedCosts
  const cover = media.find(m => m.type === 'image')

  return <div className={styles.editor} data-product-editor>
    <header className={styles.editorHeading}>
      <button type="button" onClick={close} disabled={busy} className={styles.back}>← Products</button>
      <div className={styles.titleLine}><div><p className={styles.eyebrow}>{sandbox ? 'Fictional test catalog' : 'Product workspace'}</p><h1>{saved ? fields.name || 'Edit product' : 'Create a product'}</h1></div><span className={`${styles.badge} ${saved?.is_active ? styles.published : ''}`}>{saved ? status(saved) : 'New draft'}</span></div>
      <p className={styles.subtitle}>One product record. Two thoughtfully curated storefronts.</p>
    </header>
    <div ref={noticeRef} aria-live="polite">{error && <div role="alert" className={styles.error}>{error}</div>}{message && <div role="status" className={styles.success}>{message}</div>}</div>
    <div className={styles.editorLayout}>
      <div className={styles.formArea}>
        <div className={styles.tabs} role="tablist" aria-label="Product editor sections" onKeyDown={event => { const index = tabs.findIndex(item => item.id === tab); const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null; if (next !== null) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus() } }}>{tabs.map(item => <button key={item.id} type="button" role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} className={tab === item.id ? styles.activeTab : ''}>{item.label}{item.id === 'media' && media.length > 0 && <span>{media.length}</span>}</button>)}</div>
        <fieldset disabled={busy} className={styles.formFields}>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'basics' && <>
              <Section title="The essentials" note="Start with a name. You can save an unfinished product as a private draft.">
                <Field label="Product name *" wide><input value={fields.name} onChange={e => set('name', e.target.value)} placeholder="Give your product a clear, memorable name" maxLength={200} autoComplete="off" /></Field>
                <Field label="SKU"><input value={fields.commerce.sku ?? ''} onChange={e => commerce('sku', e.target.value)} placeholder="Your product reference" /></Field>
                <Field label="Category"><input list="product-categories" value={fields.commerce.category ?? ''} onChange={e => commerce('category', e.target.value)} placeholder="Choose or type a category" /><datalist id="product-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></Field>
                <Field label="Short introduction" wide hint="A concise description shown in product summaries."><textarea rows={2} value={fields.commerce.short_description ?? ''} onChange={e => commerce('short_description', e.target.value)} maxLength={500} /></Field>
                <Field label="Full description" wide><textarea rows={6} value={fields.description} onChange={e => set('description', e.target.value)} placeholder="What makes it special? Describe its use, finish and what is included." /></Field>
              </Section>
              <Section title="Where it belongs" note="Both storefronts share the same inventory. A selection does not publish the product.">
                <label className={styles.choice}><input type="checkbox" checked={fields.commerce.storefronts?.includes('christmas') ?? false} onChange={() => toggleStore('christmas')} /><span><strong>Christmas by PostDuty</strong><small>Seasonal gifts & decorations</small></span></label>
                <label className={styles.choice}><input type="checkbox" checked={fields.commerce.storefronts?.includes('general') ?? false} onChange={() => toggleStore('general')} /><span><strong>The PostDuty Store</strong><small>Healthcare, makers & everyday objects</small></span></label>
                <Field label="Collections" wide hint="Separate collection names with commas."><input value={fields.collections_text} onChange={e => set('collections_text', e.target.value)} placeholder="e.g. Thoughtful gifts, Made by hand" /></Field>
                <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={fields.commerce.featured ?? false} onChange={e => commerce('featured', e.target.checked)} />Feature this product in selected storefronts</label>
              </Section>
            </>}
            {tab === 'media' && <Section title="Show the details" note="Use approved photographs of the actual product. The first photo becomes the cover image. Up to 12 files, including two videos.">
              <div className={`${styles.dropzone} ${styles.wide} ${dragOver ? styles.dragOver : ''}`} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files) }}>
                <span className={styles.uploadIcon} aria-hidden="true">↑</span><strong>{uploadProgress || 'Bring your product to life'}</strong><p>Choose photos or videos from your gallery, or take a photo.</p>
                <div className={styles.buttonRow}><button type="button" className={styles.primary} onClick={() => filesRef.current?.click()}>Add photos / video</button><button type="button" className={styles.secondary} onClick={() => cameraRef.current?.click()}>Use camera</button></div>
                <small>Photos up to 8 MB · MP4 / WebM videos up to 25 MB</small>
                <input ref={filesRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" hidden onChange={e => { if (e.target.files) void upload(e.target.files); e.target.value = '' }} />
                <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e => { if (e.target.files) void upload(e.target.files); e.target.value = '' }} />
              </div>
              {media.map((item, index) => <article key={`${item.url}-${index}`} className={`${styles.mediaCard} ${styles.wide}`}>
                <div className={styles.mediaPreview}>{item.type === 'video' ? <video src={item.url} controls playsInline preload="metadata" /> : <img src={item.url} alt={item.alt || 'Product photograph'} />}{item === cover && <span className={styles.coverBadge}>Cover photo</span>}</div> {/* eslint-disable-line @next/next/no-img-element */}
                <div className={styles.mediaDetails}><Field label={item.type === 'image' ? 'Image description' : 'Video description'}><input value={item.alt} onChange={e => updateMedia(index, { alt: e.target.value })} placeholder="Describe what is shown" /></Field><Field label="Copyright / attribution"><input value={item.attribution ?? ''} onChange={e => updateMedia(index, { attribution: e.target.value })} placeholder="Photographer or rights information" /></Field><div className={styles.smallActions}><button type="button" disabled={index === 0} onClick={() => moveMedia(index, index - 1)} aria-label={`Move media ${index + 1} earlier`}>↑ Earlier</button><button type="button" disabled={index === media.length - 1} onClick={() => moveMedia(index, index + 1)} aria-label={`Move media ${index + 1} later`}>↓ Later</button>{item.type === 'image' && item !== cover && <button type="button" onClick={() => moveMedia(index, 0)}>Make cover</button>}<button type="button" className={styles.dangerText} onClick={() => commerce('media', media.filter((_, i) => i !== index))}>Remove</button></div></div>
              </article>)}
              {!media.length && <p className={`${styles.note} ${styles.wide}`}>Photos and videos are attached to the product when you save. Add clear close-ups and a view that shows scale.</p>}
            </Section>}
            {tab === 'pricing' && <>
              <Section title="Price with confidence" note="All amounts here are in rupees. Only the approved selling price is used at checkout.">
                <Field label="Approved selling price (₹)"><input type="number" inputMode="decimal" min="0" step="0.01" value={fields.price} onChange={e => set('price', e.target.value)} placeholder="0.00" /></Field>
                <Field label="Proposed price (₹)" hint="Private working estimate."><input type="number" inputMode="decimal" min="0" step="0.01" value={op('proposed_price_rupees')} onChange={e => operation('proposed_price_rupees', num(e.target.value))} /></Field>
                <Field label="Marketplace commission (%)" hint="Recorded for reconciliation; does not transfer money."><input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={op('commission_percent')} onChange={e => operation('commission_percent', num(e.target.value))} /></Field>
                <Field label="HSN code" hint="4, 6 or 8 digits. Saved on each order line for tax records."><input inputMode="numeric" maxLength={8} pattern="\d{4}|\d{6}|\d{8}" value={fields.commerce.hsn ?? ''} onChange={e => commerce('hsn', e.target.value.replace(/\D/g, '') || undefined)} placeholder="e.g. 7117" /></Field>
                <Field label="GST rate (%)" hint="Selling prices include GST. Used for the order tax breakdown."><select value={fields.commerce.gst_rate_bps === undefined ? '' : String(fields.commerce.gst_rate_bps)} onChange={e => commerce('gst_rate_bps', e.target.value === '' ? undefined : Number(e.target.value))}><option value="">Not set</option>{GST_RATES_BPS.map(bps => <option key={bps} value={bps}>{bps / 100}%</option>)}</select></Field>
                <Field label="Tax configuration notes" hint="Record the approved tax treatment; not an automatic tax engine."><input value={op('tax_configuration')} onChange={e => operation('tax_configuration', e.target.value)} /></Field>
              </Section>
              <Section title="Private cost worksheet" note="Enter unit costs. Use zero only when a cost is confirmed not applicable. These values are never shown to customers.">
                {costLabels.map(([key, label]) => <Field key={key} label={`${label} (₹)`}><input type="number" min="0" step="0.01" inputMode="decimal" value={typeof costs[key] === 'number' || typeof costs[key] === 'string' ? String(costs[key]) : ''} onChange={e => operation('costs_rupees', { ...costs, [key]: num(e.target.value) })} placeholder="Not recorded" /></Field>)}
                <div className={`${styles.costSummary} ${styles.wide}`}><div><span>Recorded unit costs</span><strong>{money(recordedCosts * 100)}</strong></div><div><span>Estimated contribution / unit</span><strong>{completeCosts && fields.price ? money(contribution * 100) : 'Insufficient data'}</strong></div><div><span>Estimated contribution margin</span><strong>{completeCosts && price > 0 ? `${((contribution / price) * 100).toFixed(1)}%` : 'Insufficient data'}</strong></div><p>Estimate = approved selling price less recorded unit costs. It excludes unrecorded overhead, returns and other costs. This is not realized profit.</p></div>
              </Section>
              <Section title="Promotion planning" note="Private notes only. These fields do not activate discounts or alter the checkout price."><Field label="Discount / bundle pricing notes" wide><textarea rows={3} value={op('promotion_notes')} onChange={e => operation('promotion_notes', e.target.value)} placeholder="Record proposed offers and bundle economics for approval." /></Field></Section>
            </>}
            {tab === 'inventory' && <>
              <ComboEditor product={product} catalog={catalog} combo={fields.commerce.combo} onChange={combo => commerce('combo', combo)} />
              <Section title="Availability & production" note="Keep availability realistic. Preparation time is an estimate, not a delivery guarantee.">
                <Field label={fields.commerce.made_to_order ? 'Available production slots' : 'Available stock'} hint={fields.commerce.made_to_order ? 'Units you can currently accept for production. Zero means unavailable.' : undefined}><input type="number" min="0" step="1" inputMode="numeric" value={fields.stock} onChange={e => set('stock', e.target.value)} /></Field>
                <Field label="Low-stock threshold"><input type="number" min="0" step="1" inputMode="numeric" value={fields.commerce.low_stock_threshold ?? ''} onChange={e => commerce('low_stock_threshold', num(e.target.value))} /></Field>
                <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={fields.commerce.made_to_order ?? false} onChange={e => commerce('made_to_order', e.target.checked)} />Made to order</label>
                <Field label="Preparation time (days)"><input type="number" min="0" step="1" inputMode="numeric" value={fields.commerce.preparation_days ?? ''} onChange={e => commerce('preparation_days', num(e.target.value))} /></Field>
                <Field label="Production capacity (units)" hint="Planning reference only. Changing capacity does not add or reset available stock or production slots."><input type="number" min="0" step="1" inputMode="numeric" value={fields.commerce.capacity ?? ''} onChange={e => commerce('capacity', num(e.target.value))} /></Field>
                <Field label="Dimensions"><input value={fields.commerce.dimensions ?? ''} onChange={e => commerce('dimensions', e.target.value)} placeholder="Length × width × height, with units" /></Field>
                <Field label="Weight (grams)"><input type="number" min="0" step="1" inputMode="numeric" value={fields.commerce.weight_grams ?? ''} onChange={e => commerce('weight_grams', num(e.target.value))} /></Field>
                <Field label="Shipping method"><input value={fields.commerce.shipping_method ?? ''} onChange={e => commerce('shipping_method', e.target.value)} placeholder="Approved service or dispatch method" /></Field>
                <Field label="Fulfillment owner / supplier" hint="Private operational reference."><input value={op('fulfillment_owner')} onChange={e => operation('fulfillment_owner', e.target.value)} placeholder="PostDuty or assigned creator" /></Field>
                <Field label="Packing and production instructions" wide><textarea rows={3} value={op('packaging_instructions')} onChange={e => operation('packaging_instructions', e.target.value)} /></Field>
              </Section>
              <Section title="Variants" note={fields.commerce.made_to_order ? 'Each option has its own price and available production slots. Keep total available slots consistent. Made-to-order products do not have unlimited availability.' : 'Add each purchasable combination, such as Red / Small. Each variant has its own price and stock; keep total available stock consistent.'}>
                {fields.variants.map((variant, index) => <div key={variant.id} className={`${styles.variant} ${styles.wide}`}><div className={styles.grid}><Field label={`Option ${index + 1}`}><input value={variant.name} onChange={e => updateVariant(index, { name: e.target.value })} placeholder="Color / size / material" /></Field><Field label="Variant SKU"><input value={variant.sku ?? ''} onChange={e => updateVariant(index, { sku: e.target.value })} /></Field><Field label="Price (₹)"><input type="number" min="0" step="0.01" inputMode="decimal" value={variant.price} onChange={e => updateVariant(index, { price: e.target.value })} /></Field><Field label={fields.commerce.made_to_order ? 'Production slots' : 'Stock'}><input type="number" min="0" step="1" inputMode="numeric" value={variant.stock} onChange={e => updateVariant(index, { stock: e.target.value })} /></Field></div><button type="button" className={styles.textButton} onClick={() => set('variants', fields.variants.filter((_, i) => i !== index))}>Remove option</button></div>)}
                <button type="button" className={styles.secondary} onClick={() => set('variants', [...fields.variants, { id: crypto.randomUUID(), name: '', price: fields.price || '0', stock: '0', sku: '' }])}>+ Add variant</button>
              </Section>
              <Section title="Personalization">
                <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={fields.commerce.personalization?.enabled ?? false} onChange={e => commerce('personalization', { label: 'Personalization text', max_length: 80, required: false, ...fields.commerce.personalization, enabled: e.target.checked })} />Allow a personalized name or message</label>
                {fields.commerce.personalization?.enabled && <><Field label="Customer field label"><input value={fields.commerce.personalization.label} onChange={e => commerce('personalization', { ...fields.commerce.personalization!, label: e.target.value })} /></Field><Field label="Character limit"><input type="number" min="1" max="500" inputMode="numeric" value={fields.commerce.personalization.max_length} onChange={e => commerce('personalization', { ...fields.commerce.personalization!, max_length: Number(e.target.value) })} /></Field><label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={fields.commerce.personalization.required} onChange={e => commerce('personalization', { ...fields.commerce.personalization!, required: e.target.checked })} />Require the customer to enter personalization</label></>}
                <p className={`${styles.note} ${styles.wide}`}>Add customer-facing customization limits to the product description or FAQs. Customer reference-image uploads are not available in this version.</p>
              </Section>
            </>}
            {tab === 'details' && <>
              <Section title="Materials & discovery">
                <Field label="Materials and features" wide><textarea rows={3} value={fields.commerce.materials ?? ''} onChange={e => commerce('materials', e.target.value)} /></Field>
                <Field label="Keywords and tags" wide hint="Separate tags with commas."><input value={fields.tags_text} onChange={e => set('tags_text', e.target.value)} /></Field>
                <Field label="Product slug" wide hint="Leave blank for a new product to generate it from the name. Changing an existing URL may break shared links."><input value={fields.slug} onChange={e => set('slug', e.target.value)} placeholder="product-name" /></Field>
                <Field label="SEO title" wide><input value={fields.commerce.seo_title ?? ''} onChange={e => commerce('seo_title', e.target.value)} maxLength={200} /></Field>
                <Field label="SEO description" wide><textarea rows={2} value={fields.commerce.seo_description ?? ''} onChange={e => commerce('seo_description', e.target.value)} maxLength={500} /></Field>
                <div className={`${styles.searchPreview} ${styles.wide}`}><span>Search preview · illustrative</span><strong>{fields.commerce.seo_title || fields.name || 'Product title'}</strong><small>{fields.commerce.storefronts?.includes('christmas') ? 'christmas.postduty.in' : 'store.postduty.in'}/products/{fields.slug || 'product-name'}</small><p>{fields.commerce.seo_description || fields.commerce.short_description || 'Add an accurate description of this product.'}</p></div>
              </Section>
              <Section title="Design rights & creator" note="Commercial rights must be verified before owner publication. Research candidates should stay in draft.">
                <Field label="Commercial design rights"><select value={op('license_status') || 'unverified'} onChange={e => operation('license_status', e.target.value)}><option value="unverified">Not yet verified</option><option value="owned">Original design — owned rights</option><option value="commercial_license">Commercial license verified</option><option value="permission_verified">Creator permission verified</option><option value="not_required">Not required — documented below</option></select></Field>
                <Field label="Product creator" hint={creatorError ? 'Creator choices are temporarily unavailable. The existing assignment is preserved.' : 'Choose an approved creator, or keep this as a PostDuty product.'}><select value={fields.creator_id} onChange={e => set('creator_id', e.target.value)} disabled={creatorChoices === null}><option value="">PostDuty — own product</option>{fields.creator_id && !creatorChoices?.some(c => c.id === fields.creator_id) && <option value={fields.creator_id}>Current creator</option>}{creatorChoices?.map(c => <option key={c.id} value={c.id} disabled={c.status === 'suspended'}>{c.display_name}{c.status !== 'active' ? ` (${c.status})` : ''}</option>)}</select></Field>
                <Field label="Private sourcing notes" wide hint="Supplier references and internal notes. Never displayed to customers."><textarea rows={3} value={fields.customisation_note} onChange={e => set('customisation_note', e.target.value)} /></Field>
                <Field label="License evidence / rights notes" wide><textarea rows={3} value={op('commercial_license_note')} onChange={e => operation('commercial_license_note', e.target.value)} placeholder="License reference, source, owner and any restrictions." /></Field>
              </Section>
              <details className={styles.details}><summary>3D-printing details</summary><div className={styles.grid}>
                <Field label="Filament type"><input value={op('filament_type')} onChange={e => operation('filament_type', e.target.value)} /></Field>
                {[['filament_cost_rupees', 'Filament cost (₹)'], ['filament_weight_grams', 'Filament weight (g)'], ['print_duration_hours', 'Print duration (hours)'], ['electricity_estimate_rupees', 'Electricity estimate (₹)'], ['hardware_cost_rupees', 'Hardware cost (₹)'], ['failure_allowance_percent', 'Failure allowance (%)'], ['total_manufacturing_cost_rupees', 'Manufacturing estimate (₹)']].map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" inputMode="decimal" value={op(key)} onChange={e => operation(key, num(e.target.value))} /></Field>)}
                <p className={`${styles.note} ${styles.wide}`}>Planning inputs only. Record confirmed costs in the pricing worksheet to include them in the contribution estimate.</p>
              </div></details>
              <details className={styles.details}><summary>Crochet & handmade details</summary><div className={styles.grid}>
                {[['handmade_material_cost_rupees', 'Material cost (₹)'], ['labor_hours', 'Labor hours'], ['handmade_production_hours', 'Production time (hours)'], ['creator_capacity', 'Creator capacity (units)']].map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" inputMode="decimal" value={op(key)} onChange={e => operation(key, num(e.target.value))} /></Field>)}
                <Field label="Customization limits" wide><textarea rows={2} value={op('customization_limits')} onChange={e => operation('customization_limits', e.target.value)} /></Field>
              </div></details>
              <Section title="Frequently asked questions">
                {(fields.commerce.faqs ?? []).map((faq, index) => <div key={index} className={`${styles.variant} ${styles.wide}`}><Field label={`Question ${index + 1}`}><input value={faq.question} onChange={e => commerce('faqs', fields.commerce.faqs!.map((f, i) => i === index ? { ...f, question: e.target.value } : f))} /></Field><Field label="Answer"><textarea rows={2} value={faq.answer} onChange={e => commerce('faqs', fields.commerce.faqs!.map((f, i) => i === index ? { ...f, answer: e.target.value } : f))} /></Field><button type="button" className={styles.textButton} onClick={() => commerce('faqs', fields.commerce.faqs!.filter((_, i) => i !== index))}>Remove question</button></div>)}
                <button type="button" className={styles.secondary} onClick={() => commerce('faqs', [...(fields.commerce.faqs ?? []), { question: '', answer: '' }])}>+ Add question</button>
              </Section>
              <div className={styles.info}><strong>Reviews stay authentic.</strong><p>Ratings are not editable here. Only genuine customer reviews should contribute to a public rating.</p></div>
            </>}
          </div>
        </fieldset>
        {saved && <div className={styles.recordActions}><span>Product actions</span><div><button type="button" disabled={busy} onClick={() => void persist('duplicate')}>Duplicate as draft</button>{saved.is_active && <button type="button" disabled={busy} onClick={() => void persist('unpublish')}>Unpublish</button>}{!saved.commerce?.archived && <button type="button" disabled={busy} className={styles.dangerText} onClick={() => void persist('archive')}>Archive</button>}</div><small>Archiving retains product and order history. Duplication creates a new draft with stock reset to zero.</small></div>}
      </div>
      <aside className={styles.previewCard} aria-label="Product summary"><p className={styles.eyebrow}>Listing at a glance</p>{cover ? <img src={cover.url} alt={cover.alt} /> : <div className={styles.emptyCover}>Your product photo<br /><span>Make the first impression count.</span></div>} {/* eslint-disable-line @next/next/no-img-element */}<h2>{fields.name || 'Your next thoughtful find'}</h2><p>{fields.commerce.short_description || 'Add the details that make your product special.'}</p><strong className={styles.previewPrice}>{money(price * 100)}</strong><div className={styles.previewMeta}><span>{fields.stock || '0'} {fields.commerce.made_to_order ? 'production slots' : 'in stock'}</span><span>{media.length} media files</span></div><div className={styles.chips}>{fields.commerce.storefronts?.map(s => <span key={s}>{s === 'christmas' ? 'Christmas' : 'General store'}</span>)}</div><small>Editor summary. Save to view the full protected product preview.</small></aside>
    </div>
    <footer className={styles.saveBar}><div className={styles.saveState}><span className={dirty ? styles.unsavedDot : styles.savedDot} /><span>{pending === 'upload' ? 'Uploading media…' : pending ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? 'All changes saved' : 'Private until published'}</span></div><div className={styles.saveActions}>{saved && <a className={styles.previewLink} href={`/admin/products/${saved.id}/preview`} target="_blank" rel="noopener noreferrer" title={dirty ? 'Preview shows the last saved version' : 'Open protected saved preview'}>Preview{dirty ? ' saved' : ''} ↗</a>}<button type="button" className={styles.secondary} disabled={busy} onClick={() => void persist()}>{pending === 'save' ? 'Saving…' : saved?.is_active ? 'Save changes' : 'Save draft'}</button>{saved && !saved.is_active && !saved.commerce?.archived && <button type="button" className={styles.primary} disabled={busy} onClick={() => void persist('publish')}>{pending === 'publish' ? 'Publishing…' : 'Publish'}</button>}</div></footer>
  </div>
}

export function ProductsClient({ initialProducts, sandbox = false }: { initialProducts: OwnerProduct[]; sandbox?: boolean }) {
  const searchParams = useSearchParams()
  const [products, setProducts] = useState(initialProducts)
  const [selected, setSelected] = useState<OwnerProduct | 'new' | null>(() => searchParams.get('new') === '1' ? 'new' : initialProducts.find(p => p.id === searchParams.get('edit')) ?? null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [store, setStore] = useState('all')
  const [category, setCategory] = useState('all')
  const published = products.filter(p => p.is_active && !p.commerce?.archived).length
  const drafts = products.filter(p => !p.is_active && !p.commerce?.archived).length
  const visible = products.filter(p => {
    const term = query.trim().toLowerCase()
    return (!term || [p.name, p.slug, p.commerce?.sku, p.commerce?.category, ...(p.commerce?.tags ?? [])].join(' ').toLowerCase().includes(term)) && (filter === 'all' ? !p.commerce?.archived : status(p).toLowerCase() === filter) && (store === 'all' || storefronts(p).includes(store as 'general' | 'christmas')) && (category === 'all' || p.commerce?.category === category)
  })
  const allCategories = [...new Set(products.map(p => p.commerce?.category).filter((value): value is string => Boolean(value)))].sort()
  function update(product: OwnerProduct) { setProducts(prev => prev.some(p => p.id === product.id) ? prev.map(p => p.id === product.id ? product : p) : [product, ...prev]) }
  if (selected) return <ProductEditor key={selected === 'new' ? 'new' : selected.id} product={selected === 'new' ? undefined : selected} sandbox={sandbox} catalog={products} onSaved={update} onClose={() => setSelected(null)} />
  return <main className={styles.catalog}>
    <header className={styles.catalogHeader}><div><p className={styles.eyebrow}>PostDuty / Commerce</p><h1>Your product studio</h1><p className={styles.subtitle}>Thoughtful products. One beautifully simple catalog.</p></div><button className={styles.primary} type="button" onClick={() => setSelected('new')}>+ Add product</button></header>
    {sandbox && <div className={styles.sandbox}><strong>Test workspace</strong><span>Fictional catalog and test checkout. No live payments or customer messages.</span></div>}
    <div className={styles.metrics}><div><strong>{published}</strong><span>Published products</span></div><div><strong>{drafts}</strong><span>Drafts to shape</span></div><div><strong>2</strong><span>Shared storefronts</span></div></div>
    <section className={styles.catalogPanel} aria-label="Product catalog">
      <div className={styles.catalogTools}><div className={styles.filters} role="group" aria-label="Listing status">{[['all', 'All products'], ['draft', 'Drafts'], ['published', 'Published'], ['archived', 'Archived']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? styles.selectedFilter : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><div className={styles.searchRow}><input type="search" aria-label="Search products" placeholder="Search name, SKU or category" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter by storefront" value={store} onChange={e => setStore(e.target.value)}><option value="all">Both storefronts</option><option value="christmas">Christmas</option><option value="general">General store</option></select><select aria-label="Filter by category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{allCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div></div>
      <div className={styles.listHeader}><span>Product</span><span>Price / availability</span></div>
      {visible.map(product => <button type="button" key={product.id} onClick={() => setSelected(product)} className={styles.productRow}><ProductImage product={product} /><div className={styles.productIdentity}><strong>{product.name}</strong><span>{product.commerce?.category || 'Uncategorized'}{product.commerce?.sku ? ` · ${product.commerce.sku}` : ''}</span><div className={styles.productTags}><span className={`${styles.badge} ${product.is_active ? styles.published : ''}`}>{status(product)}</span>{storefronts(product).map(s => <small key={s}>{s === 'christmas' ? 'Christmas' : 'General'}</small>)}</div></div><div className={styles.productNumbers}><strong>{money(product.price)}</strong><span>{product.stock} {product.commerce?.made_to_order ? 'production slots' : 'in stock'}</span><small>Edit →</small></div></button>)}
      {!visible.length && <div className={styles.emptyState}><span aria-hidden="true">✦</span><h2>{products.length ? 'No matching products' : 'A thoughtful collection starts here'}</h2><p>{products.length ? 'Try another search or filter.' : 'Add your first product, upload a photo and save it as a draft. Publish when every detail is ready.'}</p>{!products.length && <button type="button" className={styles.primary} onClick={() => setSelected('new')}>Create your first draft</button>}</div>}
      <footer className={styles.listFooter}>{visible.length} product{visible.length !== 1 ? 's' : ''} shown · Updates use one canonical inventory record.</footer>
    </section>
  </main>
}

/**
 * Owner-only combo builder: a combo is its own product (title, photos, price) made of existing products.
 * Its availability is derived from the components' stock; buying it draws down each component.
 */
function ComboEditor({ product, catalog, combo, onChange }: { product?: OwnerProduct; catalog: OwnerProduct[]; combo?: Commerce['combo']; onChange: (combo: Commerce['combo'] | undefined) => void }) {
  const components = combo?.components ?? []
  const choices = catalog.filter(p => p.id !== product?.id && !p.commerce?.combo?.components?.length && !p.commerce?.variants?.length && !p.commerce?.archived)
  const set = (next: { product_id: string; quantity: number }[]) => onChange(next.length ? { components: next } : undefined)
  const available = components.length ? Math.min(...components.map(c => Math.floor((catalog.find(p => p.id === c.product_id)?.stock ?? 0) / Math.max(1, c.quantity)))) : null
  return <Section title="Combo" note="Optional. Turn this product into a combo of existing products. The combo keeps its own title, photos and price; its stock comes from the components.">
    {components.map((component, index) => <div key={index} className={styles.wide} style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
      <Field label={`Component ${index + 1}`}><select value={component.product_id} onChange={e => set(components.map((c, i) => i === index ? { ...c, product_id: e.target.value } : c))}><option value="">Choose a product</option>{choices.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} · {p.stock} in stock</option>)}</select></Field>
      <Field label="Quantity per combo"><input type="number" min="1" max="20" step="1" inputMode="numeric" value={component.quantity} onChange={e => set(components.map((c, i) => i === index ? { ...c, quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) } : c))} /></Field>
      <button type="button" className={styles.dangerText} onClick={() => set(components.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <div className={styles.wide}>
      <button type="button" disabled={components.length >= 10} onClick={() => set([...components, { product_id: '', quantity: 1 }])}>+ Add component</button>
      {available !== null && <p className={styles.note}>Currently available: {available} combo{available === 1 ? '' : 's'}. Products with options, other combos and archived products cannot be components. Components must be published to be sold in a combo.</p>}
    </div>
  </Section>
}
