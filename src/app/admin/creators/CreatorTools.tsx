'use client';

import { useState, type FormEvent } from 'react';
import type { Creator, CreatorSettlement, CreatorSubmission } from '@/lib/creator-types';
import type { CreatorPickup } from '@/lib/types';
import type { PayoutStatus, WeeklyStatement } from '@/lib/creator-payouts';

const input = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700';
const button = 'min-h-11 rounded-xl bg-teal-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
const card = 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
type Act = (body: Record<string, unknown>) => Promise<boolean>;
const fields = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget)); };

/** Owner-approved public profile: shown on product pages only when "show" is ticked. */
export function CreatorProfileForm({ creator, busy, act }: { creator: Creator; busy: boolean; act: Act }) {
  return <form className="mt-3 space-y-3" onSubmit={event => { const values = fields(event); void act({ ...values, action: 'creator_profile', creator_id: creator.id, profile_published: values.profile_published === 'on' }); }}>
    <label className="block text-sm">Display name<input name="display_name" required maxLength={100} defaultValue={creator.display_name} className={`${input} mt-1`} /></label>
    <label className="block text-sm">Profession<input name="profession" maxLength={80} defaultValue={creator.profession ?? ''} placeholder="e.g. Staff nurse" className={`${input} mt-1`} /></label>
    <label className="block text-sm">Photo (https link)<input name="photo_url" type="url" maxLength={2048} defaultValue={creator.photo_url ?? ''} className={`${input} mt-1`} /></label>
    <label className="block text-sm">Short story<textarea name="bio" rows={3} maxLength={600} defaultValue={creator.bio} className={`${input} mt-1`} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="profile_published" defaultChecked={creator.profile_published === true} /> Show “Made by …” on this creator’s product pages</label>
    <p className="text-xs text-stone-500">Only name, profession, photo and story are ever public. Confirm the creator agrees before showing their profile.</p>
    <button className={button} disabled={busy}>Save profile</button>
  </form>;
}

/** Private pickup address: owner only, printed on packing slips. */
export function PickupForm({ creator, pickup, busy, act }: { creator: Creator; pickup?: CreatorPickup; busy: boolean; act: Act }) {
  return <form className="mt-3 space-y-3" onSubmit={event => { void act({ ...fields(event), action: 'pickup_address', creator_id: creator.id }); }}>
    <label className="block text-sm">Pickup contact name<input name="pickup_name" required maxLength={100} defaultValue={pickup?.pickup_name ?? ''} className={`${input} mt-1`} /></label>
    <label className="block text-sm">Pickup mobile<input name="phone" type="tel" required defaultValue={pickup?.phone ?? ''} className={`${input} mt-1`} /></label>
    <label className="block text-sm">Pickup address<textarea name="address" required rows={3} maxLength={500} defaultValue={pickup?.address ?? ''} className={`${input} mt-1`} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="block text-sm">PIN code<input name="pincode" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} defaultValue={pickup?.pincode ?? ''} className={`${input} mt-1`} /></label>
    <label className="block text-sm">Shiprocket pickup location<input name="shiprocket_location" maxLength={64} defaultValue={pickup?.shiprocket_location ?? ''} className={`${input} mt-1`} /></label></div>
    <p className="text-xs text-stone-500">Never shown publicly. Appears on packing slips and the owner order view for this creator’s items.</p>
    <button className={button} disabled={busy}>Save pickup address</button>
  </form>;
}

const statusLabel: Record<PayoutStatus, string> = { ready: 'Payable', pending_courier_cost: 'Pending courier cost', cancelled: 'Cancelled · pays 0', refunded: 'Refunded · pays 0', unavailable: 'Not calculable', settled: 'Already settled' };

/** Weekly statement (Monday–Sunday, India time) computed on the server from orders and courier costs. */
export function WeeklyStatementPanel({ creators, busy, act }: { creators: Creator[]; busy: boolean; act: Act }) {
  const [creatorId, setCreatorId] = useState('');
  const [week, setWeek] = useState(() => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10));
  const [statement, setStatement] = useState<WeeklyStatement | null>(null);
  const [message, setMessage] = useState('');
  async function load() {
    setMessage(''); setStatement(null);
    const response = await fetch(`/api/admin/creator-statement?creator_id=${encodeURIComponent(creatorId)}&week=${encodeURIComponent(week)}`, { cache: 'no-store' });
    const body = await response.json() as { statement?: WeeklyStatement; error?: string };
    if (!response.ok || !body.statement) { setMessage(body.error ?? 'The statement could not be loaded.'); return; }
    setStatement(body.statement);
  }
  return <div className={`${card} space-y-3`}>
    <h3 className="font-semibold">Weekly statement</h3>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block text-sm">Creator<select value={creatorId} onChange={e => setCreatorId(e.target.value)} className={`${input} mt-1`}><option value="">Select creator</option>{creators.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
      <label className="block text-sm">Any day in the week<input type="date" value={week} onChange={e => setWeek(e.target.value)} className={`${input} mt-1`} /></label>
      <button type="button" className={`${button} self-end`} disabled={!creatorId || !week || busy} onClick={() => void load()}>Show statement</button>
    </div>
    {message && <p className="text-sm text-red-800">{message}</p>}
    {statement && <>
      <p className="text-sm text-stone-600">{statement.period_start} to {statement.period_end}</p>
      {!statement.lines.length ? <p className="text-sm text-stone-500">No creator lines in this week.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr className="border-b"><th className="py-2 pr-2">Order / item</th><th>Value</th><th>Shipping</th><th>GST</th><th>Payment fee</th><th>Courier</th><th>Platform</th><th>Payout</th><th>Status</th></tr></thead>
        <tbody>{statement.lines.map(line => <tr key={line.order_item_id} className="border-b border-stone-100">
          <td className="py-2 pr-2">#{line.order_id.slice(0, 8).toUpperCase()} · {line.product_name} × {line.quantity}</td>
          <td>{money(line.line_value)}</td><td>{money(line.shipping_share)}</td><td>−{money(line.gst)}</td><td>−{money(line.payment_fee)}</td>
          <td>{line.courier_cost === null ? '—' : `−${money(line.courier_cost)}`}</td><td>−{money(line.platform_fee)}</td>
          <td className="font-semibold">{line.payout_paise === null ? '—' : money(line.payout_paise)}</td><td>{statusLabel[line.status]}</td>
        </tr>)}</tbody>
      </table></div>}
      <p className="text-sm">Payable now: <strong>{money(statement.payable_paise)}</strong> ({statement.payable_lines} line{statement.payable_lines === 1 ? '' : 's'}){statement.pending_courier_lines > 0 && <span className="text-amber-800"> · {statement.pending_courier_lines} pending courier cost</span>}{statement.settled_paise > 0 && <span className="text-stone-500"> · {money(statement.settled_paise)} already settled</span>}</p>
      {statement.payable_lines > 0 && <button className={button} disabled={busy} onClick={async () => {
        if (!window.confirm(`Create a pending settlement of ${money(statement.payable_paise)}? No money is transferred.`)) return;
        if (await act({ action: 'settlement_from_statement', creator_id: statement.creator_id, week: statement.period_start })) await load();
      }}>Create pending settlement from this statement</button>}
    </>}
  </div>;
}

/** Approved → paid: the owner records the date and UPI/bank reference of a transfer made outside the system. */
export function MarkPaidForm({ settlement, busy, act }: { settlement: CreatorSettlement; busy: boolean; act: Act }) {
  if (settlement.status === 'paid') return <p className="text-xs text-stone-500">Paid on {settlement.paid_on ?? '—'} · Reference {settlement.payment_reference ?? '—'}</p>;
  if (settlement.status !== 'approved') return null;
  return <form className="space-y-2" onSubmit={event => { const values = fields(event); if (window.confirm('Record this settlement as paid? Only do this after the transfer has been made.')) void act({ ...values, action: 'settlement_paid', id: settlement.id }); }}>
    <div className="grid grid-cols-2 gap-2"><label className="block text-xs">Paid on<input name="paid_on" type="date" required className={`${input} mt-1`} /></label>
    <label className="block text-xs">UPI / bank reference<input name="reference" required minLength={3} maxLength={80} className={`${input} mt-1`} /></label></div>
    <button className={`${button} w-full`} disabled={busy}>Mark paid</button>
  </form>;
}

const revisionLabels: Record<string, string> = { name: 'Title', description: 'Description', short_description: 'Short description', materials: 'Materials', dimensions: 'Dimensions', preparation_days: 'Preparation days', media: 'Photos & videos' };
/** Creator edits to live products. One tap applies only the creator-editable fields; price and publishing stay yours. */
export function RevisionInbox({ revisions, creatorName, busy, act }: { revisions: CreatorSubmission[]; creatorName: (id: string) => string; busy: boolean; act: Act }) {
  if (!revisions.length) return null;
  return <div className="space-y-3"><h3 className="font-semibold">Edits to live products ({revisions.length})</h3>{revisions.map(revision => <article key={revision.id} className={`${card} space-y-2`}>
    <p className="text-xs text-teal-800">{creatorName(revision.creator_id)} · <a className="underline" href={`/admin/products/${revision.product_id}/preview`} target="_blank" rel="noreferrer">current listing</a></p>
    <h4 className="font-semibold">{revision.title}</h4>
    <dl className="space-y-1 text-sm">{Object.entries(revision.details).map(([key, value]) => <div key={key}><dt className="text-xs text-stone-500">{revisionLabels[key] ?? key}</dt><dd className="whitespace-pre-wrap">{key === 'media' && Array.isArray(value) ? (value as { url: string; type: string }[]).map((m, i) => <a key={i} className="mr-2 text-teal-800 underline" href={m.url} target="_blank" rel="noreferrer">{m.type} {i + 1}</a>) : String(value)}</dd></div>)}</dl>
    {revision.proposed_price > 0 && <p className="text-xs text-stone-500">Proposed price {money(revision.proposed_price)} (recorded privately; the selling price does not change).</p>}
    <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => void act({ action: 'review_revision', id: revision.id, status: 'approved' })}>Approve edit</button>
    <button className="min-h-11 rounded-xl border border-stone-300 px-4 py-3 text-sm" disabled={busy} onClick={() => { const note = window.prompt('Feedback for the creator (optional)') ?? ''; void act({ action: 'review_revision', id: revision.id, status: 'rejected', owner_note: note }); }}>Reject</button></div>
  </article>)}</div>;
}
