'use client';

import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { CreatorFulfillment, CreatorPortalData } from '@/lib/creator-types';
import { fulfillmentLabel, fulfillmentNext } from '@/lib/creator-types';
import { CreatorProducts, CreatorStatements } from './CreatorSelfService';

const input = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700';
const button = 'rounded-xl bg-teal-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
const card = 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
type Media = {url: string; type: 'image' | 'video'; alt: string; attribution?: string};

export default function CreatorPortal({ supabaseUrl, supabaseAnonKey }: {supabaseUrl: string; supabaseAnonKey: string}) {
  const client = useMemo(() => supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null, [supabaseUrl, supabaseAnonKey]);
  const [token, setToken] = useState('');
  const [data, setData] = useState<CreatorPortalData | null>(null);
  const [tab, setTab] = useState<'orders' | 'products' | 'earnings' | 'profile'>('orders');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabaseUrl && supabaseAnonKey));
  const [media, setMedia] = useState<Media[]>([]);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError('');
    try {
      const invite = sessionStorage.getItem('postduty_creator_invite');
      if (invite) {
        const result = await fetch('/api/creator/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({token: invite}) });
        const response = await result.json() as CreatorPortalData & {error?: string; url: string; type: 'image' | 'video'};
        if (!result.ok) throw new Error(response.error);
        sessionStorage.removeItem('postduty_creator_invite');
      }
      const result = await fetch('/api/creator/session', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const response = await result.json() as CreatorPortalData & {error?: string; url: string; type: 'image' | 'video'};
      if (!result.ok) throw new Error(response.error);
      setData(response);
    } catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'Unable to load your creator account.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const invite = fragment.get('invite');
    if (invite && /^[0-9a-f]{64}$/.test(invite)) {
      sessionStorage.setItem('postduty_creator_invite', invite);
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (!client) return;
    let mounted = true;
    let previousToken: string | null = null;
    const sessionChanged = (accessToken: string) => {
      if (!mounted || previousToken === accessToken) return;
      previousToken = accessToken;
      setToken(accessToken);
      if (accessToken) window.setTimeout(() => { if (mounted) void load(accessToken); }, 0);
      else { setData(null); setLoading(false); }
    };
    client.auth.getSession().then(({ data: sessionData }) => sessionChanged(sessionData.session?.access_token || ''));
    const {data: subscription} = client.auth.onAuthStateChange((_event, session) => sessionChanged(session?.access_token || ''));
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, [client, load]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function action(path: string, body: unknown) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await fetch(`/api/creator/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const response = await result.json() as CreatorPortalData & {error?: string; url: string; type: 'image' | 'video'};
      if (!result.ok) throw new Error(response.error);
      await load(token);
      setNotice(path === 'submissions' ? 'Submitted to the owner for review. Your proposal is not public.' : 'Saved successfully.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); return false; }
    finally { setBusy(false); }
  }

  async function signIn() {
    setError('');
    if (!client) { setError('Google sign-in is not configured for this environment yet.'); return; }
    const {error: signInError} = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/creator`, queryParams: { prompt: 'select_account' } } });
    if (signInError) setError('Google sign-in is not configured or is temporarily unavailable. Please contact the owner.');
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (media.length + files.length > 12) { setError('Use at most 12 photos or videos per submission.'); return; }
    setUploading(true); setError('');
    try {
      const added: Media[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData(); form.set('file', file);
        const result = await fetch('/api/creator/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const response = await result.json() as CreatorPortalData & {error?: string; url: string; type: 'image' | 'video'};
        if (!result.ok) throw new Error(response.error);
        added.push({...response, alt: file.name.replace(/\.[^.]+$/, '')});
      }
      setMedia(previous => [...previous, ...added]); setDirty(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setUploading(false); }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const saved = await action('submissions', { ...Object.fromEntries(values), storefronts: values.getAll('storefronts'), made_to_order: values.get('made_to_order') === 'on', media });
    if (saved) { form.reset(); setMedia([]); setDirty(false); }
  }

  function changeTab(next: typeof tab) {
    if (dirty && next !== tab && !window.confirm('Leave this unsaved proposal? Your entered text will be lost.')) return;
    setDirty(false); setTab(next);
  }

  return <main className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-6">
    <header className="mb-6 flex items-start justify-between gap-3"><div><Link href="/" className="text-xs font-bold uppercase tracking-widest text-teal-800">PostDuty</Link><h1 className="mt-1 text-2xl font-semibold">Creator studio</h1><p className="mt-1 text-sm text-stone-600">Your products, your orders, one calm workspace.</p></div>{token && <button type="button" className="min-h-11 text-sm underline" onClick={async () => { await client?.auth.signOut(); setData(null); setToken(''); }}>Sign out</button>}</header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-4 text-sm text-teal-900">{notice}</p>}
    {loading ? <p className={card}>Loading your workspace…</p> : !data ? <section className={`${card} mt-10 space-y-5 py-8`}><p className="text-xs font-semibold uppercase tracking-widest text-teal-800">By invitation</p><h2 className="text-2xl font-serif">Make something people love.</h2><p className="text-sm leading-6 text-stone-600">Sign in with the Google email on your PostDuty invitation. The owner reviews all product submissions before they appear in a store.</p><button className={`${button} w-full`} onClick={signIn}>Continue with Google</button>{token && <button className="min-h-11 text-sm text-teal-800 underline" onClick={() => {sessionStorage.removeItem("postduty_creator_invite"); void load(token);}}>Use my existing creator account</button>}<p className="text-xs text-stone-500">An invitation and active creator approval are required. Contact the owner if you need access.</p></section> : <>
      {data.sandbox && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Preview workspace · Fictional orders and test payments only.</p>}
      <div className="mb-5 flex items-center justify-between"><p className="text-sm text-stone-600">Welcome, <strong className="text-stone-900">{data.creator.display_name}</strong></p><button className="min-h-11 text-sm text-teal-800 underline" onClick={() => load(token)}>Refresh</button></div>
      {tab === 'orders' && <section className="space-y-3"><h2 className="text-lg font-semibold">Assigned orders</h2><p className="text-sm text-stone-600">Only items assigned to you appear here. Updates are visible to the owner; customer messages remain owner-controlled.</p>{!data.fulfillment.length ? <p className={card}>No assigned orders yet.</p> : data.fulfillment.map(item => <FulfillmentCard key={item.id} item={item} busy={busy} onUpdate={body => action('fulfillment', body)} />)}</section>}
      {tab === 'products' && <CreatorProducts token={token} />}{tab === 'products' && <section className="space-y-4"><details className={card} open={!data.submissions.length}><summary className="cursor-pointer py-2 font-semibold">+ Submit a product</summary><form onSubmit={submitProduct} onChange={() => setDirty(true)} className="mt-4 space-y-4"><label className="block text-sm">Product name<input name="title" required maxLength={150} className={`${input} mt-1`} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">Suggested price (₹)<input name="proposed_price_rupees" type="number" min="1" step="0.01" required className={`${input} mt-1`} /></label><label className="text-sm">Available quantity<input name="stock" type="number" min="0" defaultValue="0" required className={`${input} mt-1`} /></label></div><label className="block text-sm">Description<textarea name="description" rows={3} maxLength={10000} className={`${input} mt-1`} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">Category<input name="category" placeholder="Crochet gifts" className={`${input} mt-1`} /></label><label className="text-sm">Preparation days<input name="preparation_days" type="number" min="0" max="365" defaultValue="0" className={`${input} mt-1`} /></label></div><label className="flex min-h-11 items-center gap-2 text-sm"><input name="made_to_order" type="checkbox" />Made to order</label><fieldset className="rounded-xl border border-stone-200 p-3"><legend className="px-1 text-sm">Proposed storefronts</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input name="storefronts" value="general" type="checkbox" defaultChecked />PostDuty Store</label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="storefronts" value="christmas" type="checkbox" />Christmas by PostDuty</label></fieldset><label className="block text-sm">Photos & videos<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple onChange={event => upload(event.target.files)} className="mt-2 block w-full text-sm" disabled={uploading} /></label><p className="text-xs text-stone-500">Images up to 8 MB · Videos up to 25 MB · 12 files maximum</p>{uploading && <p role="status" className="text-sm">Uploading…</p>}{media.map((item, index) => <div key={item.url} className="rounded-xl border border-stone-200 p-3"><a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-teal-800 underline">{item.type === 'image' ? 'Photo' : 'Video'} {index + 1}</a><label className="mt-2 block text-xs">Description<input value={item.alt} onChange={event => setMedia(previous => previous.map((value, itemIndex) => itemIndex === index ? {...value, alt: event.target.value} : value))} className={`${input} mt-1`} /></label><label className="mt-2 block text-xs">Copyright / attribution<input value={item.attribution || ''} onChange={event => setMedia(previous => previous.map((value, itemIndex) => itemIndex === index ? {...value, attribution: event.target.value} : value))} className={`${input} mt-1`} /></label><button type="button" onClick={() => setMedia(previous => previous.filter((_, itemIndex) => itemIndex !== index))} className="mt-2 min-h-11 text-sm text-red-700">Remove</button></div>)}<details><summary className="cursor-pointer py-3 text-sm font-medium">Materials, customization & licensing</summary><label className="block text-sm">Materials<input name="materials" className={`${input} my-2`} /></label><label className="block text-sm">Production and customization instructions<textarea name="production_notes" rows={3} className={`${input} my-2`} /></label><label className="block text-sm">Design rights / commercial license explanation<textarea name="license_status" rows={2} maxLength={100} className={`${input} my-2`} /></label></details><button className={`${button} w-full`} disabled={busy || uploading}>{busy ? 'Submitting…' : 'Submit for owner review'}</button><p className="text-xs text-stone-500">The owner approves pricing, stock and publication. Submissions do not change live products.</p></form></details><h2 className="text-lg font-semibold">Your submissions</h2>{!data.submissions.length && <p className={card}>Your first submission will appear here.</p>}{data.submissions.map(submission => <article className={card} key={submission.id}><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{submission.title}</h3><span className="rounded-full bg-stone-100 px-3 py-1 text-xs capitalize">{submission.status}</span></div><p className="mt-2 text-sm">Suggested {money(submission.proposed_price)}</p><p className="mt-1 text-xs text-stone-500">Submitted {new Date(submission.created_at).toLocaleDateString('en-IN')}</p>{submission.owner_note && <p className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">Owner feedback: {submission.owner_note}</p>}</article>)}</section>}
      {tab === 'earnings' && <section className="space-y-4"><h2 className="text-lg font-semibold">Earnings & reconciliation</h2><CreatorStatements token={token} /><div className={card}><p className="text-sm text-stone-600">Approved for manual settlement</p><p className="mt-1 text-3xl font-semibold">{money(data.settlements.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount_paise, 0))}</p><p className="mt-3 text-xs leading-5 text-stone-500">From the latest 100 owner-entered settlement records. This is not an automatic payout or a complete earnings calculation. Commission setting: {(data.creator.commission_bps / 100).toFixed(2)}%.</p></div>{!data.settlements.length ? <p className={card}>No reconciled earnings yet. The owner records settlements after reviewing orders and costs.</p> : data.settlements.map(item => <article key={item.id} className={card}><div className="flex justify-between"><strong>{money(item.amount_paise)}</strong><span className="text-sm capitalize">{item.status === 'paid' ? 'Recorded externally' : item.status}</span></div><p className="mt-2 text-sm text-stone-600">{item.note || 'Owner reconciliation'}</p><p className="mt-2 text-xs text-stone-500">{new Date(item.created_at).toLocaleDateString('en-IN')}</p></article>)}</section>}
      {tab === 'profile' && <form className={`${card} space-y-4`} onSubmit={async event => { event.preventDefault(); await action('profile', Object.fromEntries(new FormData(event.currentTarget))); }}><h2 className="text-lg font-semibold">Creator profile</h2><label className="block text-sm">Display name<input name="display_name" defaultValue={data.creator.display_name} required maxLength={100} className={`${input} mt-1`} /></label><label className="block text-sm">Your story<textarea name="bio" defaultValue={data.creator.bio} maxLength={1200} rows={4} className={`${input} mt-1`} /></label><label className="block text-sm">Weekly production capacity (items)<input name="capacity" type="number" min="0" max="100000" defaultValue={data.creator.capacity || 0} className={`${input} mt-1`} /></label><p className="text-xs text-stone-500">Sign-in email: {data.creator.email}. Only the owner manages account access and commercial terms.</p><button className={`${button} w-full`} disabled={busy}>Save profile</button></form>}
      <nav aria-label="Creator navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur"><div className="mx-auto grid max-w-3xl grid-cols-4">{(['orders', 'products', 'earnings', 'profile'] as const).map(item => <button key={item} onClick={() => changeTab(item)} className={`min-h-16 px-2 py-4 text-xs font-semibold capitalize ${tab === item ? 'border-t-2 border-teal-800 bg-teal-50 text-teal-900' : 'text-stone-500'}`}>{item}</button>)}</div></nav>
    </>}
  </main>;
}

function FulfillmentCard({ item, busy, onUpdate }: {item: CreatorFulfillment; busy: boolean; onUpdate: (body: unknown) => Promise<boolean>}) {
  const next = fulfillmentNext[item.status];
  const shipping = item.shipping_address;
  return <article className={`${card} space-y-3`}><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{item.product_name} <span className="font-normal">× {item.quantity}</span></h3><span className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-900">{fulfillmentLabel[item.status]}</span></div><p className="text-xs text-stone-500">Order {item.order_id.slice(0, 8)}{item.is_test ? " · Test order" : ""}</p><p className="text-xs text-stone-600">{item.creator_earning_paise != null ? `Item earning estimate: ${money(item.creator_earning_paise)} before tax, refunds or adjustments.` : "Earnings: owner reconciliation required."}</p><div className="rounded-xl bg-stone-50 p-3 text-sm space-y-1">{item.variant_name && <p>Option: <strong>{item.variant_name}</strong></p>}{item.customer_paid_paise != null && <p>Item price paid by customer: <strong>{money(item.customer_paid_paise)}</strong> <span className="text-xs text-stone-500">(before any coupon)</span></p>}{item.order_total_paise != null && <p className="text-xs text-stone-600">Whole order: {money(item.order_total_paise)}{item.order_delivery_paise ? ` incl. ${money(item.order_delivery_paise)} delivery` : ' · free delivery'} · paid online, do not collect cash</p>}<p className="text-xs text-stone-600">{item.delivery_method === 'same_day' ? 'SAME-DAY delivery: deliver today' : 'Standard delivery: deliver within 3 working days'}</p>{item.gift && <p className="text-xs text-stone-600">Gift order{item.gift.message ? ` · message: “${item.gift.message}”` : ''} · no price tag</p>}</div><details open={item.status !== 'dispatched'}><summary className="cursor-pointer py-2 text-sm font-medium">Delivery details & requirements</summary><div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-3 text-sm"><p className="font-semibold">{String(shipping.name || '')}</p><p className="whitespace-pre-wrap">{typeof shipping.address === 'string' ? shipping.address : JSON.stringify(shipping.address || {})}</p>{typeof shipping.address === 'string' && shipping.address && <p><a className="text-teal-800 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shipping.address)}`} target="_blank" rel="noreferrer">Open in Google Maps</a></p>}{shipping.phone ? <p><a className="text-teal-800 underline" href={`tel:${String(shipping.phone).replace(/[^\d+]/g, '')}`}>{String(shipping.phone)}</a></p> : null}<p className="break-words">Customization: {typeof item.requirements.personalization === 'string' ? item.requirements.personalization : JSON.stringify(item.requirements.personalization || {})}</p>{item.requirements.variant_id ? <p>Variant: {String(item.requirements.variant_id)}</p> : null}<p className="text-xs text-stone-500">Use these details only to fulfill this assigned item.</p></div></details>{item.tracking_code && <p className="text-sm">Tracking: {item.tracking_url ? <a className="text-teal-800 underline" href={item.tracking_url} target="_blank" rel="noreferrer">{item.tracking_code}</a> : item.tracking_code}</p>}{next && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void onUpdate({id: item.id, status: next, ...Object.fromEntries(new FormData(event.currentTarget))}); }}>{next === 'dispatched' && <><input aria-label="How it is being delivered" name="tracking_code" placeholder="Rapido / Porter booking ID, courier number, or “Hand-delivered”" required className={input} /><input aria-label="Tracking link" name="tracking_url" type="url" placeholder="Live tracking link, if any (optional)" className={input} /></>}<button disabled={busy} className={`${button} w-full`}>{next === 'accepted' ? 'Accept this order' : next === 'preparing' ? 'Start preparing' : next === 'ready' ? 'Mark ready to dispatch' : 'Record dispatch & tracking'}</button></form>}</article>;
}
