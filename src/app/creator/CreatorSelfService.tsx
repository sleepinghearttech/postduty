'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PayoutStatus, WeeklyStatement } from '@/lib/creator-payouts';

const input = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700';
const button = 'rounded-xl bg-teal-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
const card = 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
type Media = { url: string; type: 'image' | 'video'; alt: string };
type OwnProduct = { id: string; name: string; description: string | null; price: number; stock: number; is_active: boolean; updated_at: string; commerce?: { short_description?: string; materials?: string; dimensions?: string; preparation_days?: number; media?: Media[]; archived?: boolean } };
type Revision = { id: string; product_id: string; title: string; status: string; owner_note: string | null; updated_at: string };

/** Own products only: create drafts, edit drafts directly, propose edits to live listings for owner approval. */
export function CreatorProducts({ token }: { token: string }) {
  const [products, setProducts] = useState<OwnProduct[] | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [editing, setEditing] = useState<OwnProduct | 'new' | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch('/api/creator/products', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const body = await response.json() as { products?: OwnProduct[]; revisions?: Revision[]; error?: string };
    if (!response.ok) { setError(body.error ?? 'Your products could not be loaded.'); return; }
    setProducts(body.products ?? []); setRevisions(body.revisions ?? []);
  }, [token]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  function open(target: OwnProduct | 'new') { setEditing(target); setMedia(target === 'new' ? [] : target.commerce?.media ?? []); setMessage(''); setError(''); }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (media.length + files.length > 12) { setError('Use at most 12 photos or videos.'); return; }
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.set('file', file);
        const response = await fetch('/api/creator/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const body = await response.json() as { url?: string; type?: 'image' | 'video'; error?: string };
        if (!response.ok || !body.url || !body.type) throw new Error(body.error ?? 'Upload failed.');
        const uploaded: Media = { url: body.url, type: body.type, alt: file.name.replace(/\.[^.]+$/, '') };
        setMedia(previous => [...previous, uploaded]);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/creator/products', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...values, product_id: editing === 'new' ? null : editing?.id, media, proposed_price_rupees: values.proposed_price_rupees || null }) });
      const body = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Saving failed.');
      setMessage(body.message ?? 'Saved.'); setEditing(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Saving failed.'); }
    finally { setBusy(false); }
  }

  const pending = (id: string) => revisions.find(r => r.product_id === id && r.status === 'submitted');
  const current = editing && editing !== 'new' ? editing : null;
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">My products</h2><button className={button} disabled={busy} onClick={() => open('new')}>+ New draft</button></div>
    <p className="text-sm text-stone-600">Drafts are private until the owner approves the price and publishes them. Edits to a live product go to the owner first; your listing stays as it is until approved.</p>
    {message && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {editing && <form className={`${card} space-y-3`} onSubmit={save}>
      <h3 className="font-semibold">{current ? `Edit ${current.name}` : 'New product draft'}</h3>
      {current?.is_active && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">This product is live. Your changes are sent to the owner for approval.</p>}
      <label className="block text-sm">Title<input name="name" required minLength={2} maxLength={200} defaultValue={current?.name ?? ''} className={`${input} mt-1`} /></label>
      <label className="block text-sm">Short description<input name="short_description" maxLength={500} defaultValue={current?.commerce?.short_description ?? ''} className={`${input} mt-1`} /></label>
      <label className="block text-sm">Description<textarea name="description" rows={5} maxLength={20000} defaultValue={current?.description ?? ''} className={`${input} mt-1`} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Materials<input name="materials" maxLength={2000} defaultValue={current?.commerce?.materials ?? ''} className={`${input} mt-1`} /></label>
      <label className="block text-sm">Dimensions<input name="dimensions" maxLength={500} defaultValue={current?.commerce?.dimensions ?? ''} className={`${input} mt-1`} /></label></div>
      <div className="grid grid-cols-2 gap-3"><label className="block text-sm">Preparation days<input name="preparation_days" type="number" min="0" max="365" step="1" defaultValue={current?.commerce?.preparation_days ?? 0} className={`${input} mt-1`} /></label>
      <label className="block text-sm">Proposed price (₹)<input name="proposed_price_rupees" type="number" min="1" step="0.01" className={`${input} mt-1`} placeholder={current ? `Now ${money(current.price)}` : 'Your suggestion'} /></label></div>
      <div className="space-y-2"><p className="text-sm">Photos & videos</p><div className="flex flex-wrap gap-2">{media.map((item, index) => <span key={item.url} className="rounded-lg border border-stone-200 px-2 py-1 text-xs">{item.type} {index + 1} <button type="button" className="text-red-800 underline" onClick={() => setMedia(media.filter((_, i) => i !== index))}>remove</button></span>)}</div>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={event => void upload(event.target.files)} disabled={busy} /></div>
      <p className="text-xs text-stone-500">The owner sets the selling price, storefronts, tax details and publishing. Your proposed price is a suggestion only.</p>
      <div className="flex gap-2"><button className={button} disabled={busy}>{current?.is_active ? 'Send for approval' : 'Save draft'}</button><button type="button" className="rounded-xl border border-stone-300 px-4 py-3 text-sm" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    {products === null ? <p className={card}>Loading your products…</p> : !products.length ? <p className={card}>No products yet. Create a draft to get started.</p> : products.map(product => {
      const revision = pending(product.id);
      return <article key={product.id} className={`${card} flex items-start justify-between gap-3`}><div><h3 className="font-semibold">{product.name}</h3><p className="mt-1 text-xs text-stone-500">{product.commerce?.archived ? 'Archived' : product.is_active ? 'Live' : 'Draft'} · {product.price > 0 ? money(product.price) : 'Price not set yet'} · {product.stock} in stock</p>{revision && <p className="mt-1 text-xs text-amber-800">Edit waiting for owner approval</p>}</div>
        {!product.commerce?.archived && <button className="min-h-11 text-sm text-teal-800 underline" onClick={() => open(product)}>Edit</button>}</article>;
    })}
  </section>;
}

const statusLabel: Record<PayoutStatus, string> = { ready: 'Payable', pending_courier_cost: 'Pending courier cost', cancelled: 'Cancelled · pays 0', refunded: 'Refunded · pays 0', unavailable: 'Not calculable yet', settled: 'In a settlement' };
type Settlement = { id: string; amount_paise: number; status: string; period_start: string | null; period_end: string | null; created_at: string; paid_on: string | null; payment_reference: string | null };

/** Read-only weekly statement and settlement status for the signed-in creator. */
export function CreatorStatements({ token }: { token: string }) {
  const [week, setWeek] = useState(() => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10));
  const [statement, setStatement] = useState<WeeklyStatement | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async (target: string) => {
    setError('');
    const response = await fetch(`/api/creator/statement?week=${encodeURIComponent(target)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const body = await response.json() as { statement?: WeeklyStatement; settlements?: Settlement[]; error?: string };
    if (!response.ok || !body.statement) { setError(body.error ?? 'Your statement could not be loaded.'); return; }
    setStatement(body.statement); setSettlements(body.settlements ?? []);
  }, [token]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(week); }, 0); return () => window.clearTimeout(timer); }, [load, week]);
  return <section className="space-y-4">
    <div className={`${card} space-y-3`}>
      <div className="flex items-end justify-between gap-3"><h3 className="font-semibold">Weekly statement</h3><label className="text-sm">Week of<input type="date" value={week} onChange={e => setWeek(e.target.value)} className={`${input} mt-1`} /></label></div>
      {error && <p className="text-sm text-red-800">{error}</p>}
      {statement && <><p className="text-xs text-stone-500">{statement.period_start} to {statement.period_end} (India time). Payout = item value + shipping share − GST − payment fee − courier share − platform fee.</p>
        {!statement.lines.length ? <p className="text-sm text-stone-500">No items for you in this week.</p> : <ul className="divide-y divide-stone-100 text-sm">{statement.lines.map(line => <li key={line.order_item_id} className="flex justify-between gap-3 py-2"><span>#{line.order_id.slice(0, 8).toUpperCase()} · {line.product_name} × {line.quantity}<br /><span className="text-xs text-stone-500">{statusLabel[line.status]}</span></span><strong>{line.payout_paise === null ? '—' : money(line.payout_paise)}</strong></li>)}</ul>}
        <p className="text-sm">Payable this week: <strong>{money(statement.payable_paise)}</strong>{statement.pending_courier_lines > 0 && <span className="text-amber-800"> · {statement.pending_courier_lines} waiting for courier cost</span>}</p></>}
    </div>
    <div className={`${card} space-y-2`}><h3 className="font-semibold">Settlements</h3>
      {!settlements.length ? <p className="text-sm text-stone-500">No settlements yet.</p> : settlements.map(s => <div key={s.id} className="flex justify-between gap-3 border-t border-stone-100 pt-2 text-sm"><span>{s.period_start && s.period_end ? `${s.period_start} – ${s.period_end}` : new Date(s.created_at).toLocaleDateString('en-IN')}<br /><span className="text-xs capitalize text-stone-500">{s.status === 'paid' ? `Paid on ${s.paid_on ?? '—'} · Ref ${s.payment_reference ?? '—'}` : s.status}</span></span><strong>{money(s.amount_paise)}</strong></div>)}
    </div>
  </section>;
}
