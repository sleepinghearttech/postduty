'use client'

import { useRef, useState } from 'react';
import { orderCaseLabels, orderCaseTransitions, parseOrderCaseCommand, assertCaseAmount, type OrderCase, type OrderCaseKind, type OrderCaseStatus } from '@/lib/order-cases';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
const formatTime = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const fieldClass = 'w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-3 text-base text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand';
const buttonClass = 'min-h-11 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40';

function CaseDecision({ record, busy, onSave }: { record: OrderCase; busy: boolean; onSave: (record: OrderCase, status: Exclude<OrderCaseStatus, 'requested'>, note: string, reference: string) => Promise<boolean> }) {
  const [decision, setDecision] = useState<Exclude<OrderCaseStatus, 'requested'> | null>(null);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const allowed = orderCaseTransitions[record.status];
  async function save() {
    if (!decision) return;
    if (await onSave(record, decision, note, reference)) { setDecision(null); setNote(''); setReference(''); }
  }
  return <div className="mt-3">
    {!decision && <div className="flex flex-wrap gap-2">{allowed.map(status => <button type="button" key={status} disabled={busy} className={buttonClass} onClick={() => setDecision(status as Exclude<OrderCaseStatus, 'requested'>)}>{status === 'approved' ? 'Approve request' : status === 'rejected' ? 'Reject request' : 'Record resolution'}</button>)}</div>}
    {decision && <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3">
      <p className="text-xs font-semibold text-stone-700">{decision === 'resolved' ? 'Record an externally completed resolution' : decision === 'approved' ? 'Record owner approval' : 'Record owner rejection'}</p>
      <label className="block text-xs text-stone-600">{decision === 'rejected' ? 'Reason for rejection *' : 'Decision note'}<textarea className={`${fieldClass} mt-1`} rows={2} maxLength={4000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
      {decision === 'resolved' && <label className="block text-xs text-stone-600">External resolution reference *<input className={`${fieldClass} mt-1`} maxLength={250} value={reference} disabled={busy} onChange={event => setReference(event.target.value)} placeholder="Provider reference or documented closure ID" /><span className="mt-1 block text-[11px] leading-relaxed text-stone-500">Record the reference from work completed separately. This is not provider verification of a refund.</span></label>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={() => setDecision(null)}>Cancel</button><button type="button" disabled={busy || (decision === 'rejected' && !note.trim()) || (decision === 'resolved' && !reference.trim())} className={`${buttonClass} border-brand bg-brand text-white`} onClick={() => void save()}>{busy ? 'Saving…' : decision === 'approved' ? 'Record approval' : decision === 'rejected' ? 'Record rejection' : 'Save resolution record'}</button></div>
    </div>}
  </div>;
}

export function OrderCases({ orderId, orderTotal, initialCases, initiallyUnavailable = false }: { orderId: string; orderTotal: number; initialCases: OrderCase[]; initiallyUnavailable?: boolean }) {
  const [cases, setCases] = useState(initialCases);
  const [unavailable, setUnavailable] = useState(initiallyUnavailable);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<OrderCaseKind>('cancellation');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);
  function merge(record: OrderCase) { setCases(previous => previous.some(item => item.id === record.id) ? previous.map(item => item.id === record.id ? record : item) : [record, ...previous]); }
  async function mutate(payload: unknown): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/order-cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { case?: OrderCase; error?: string } | null;
      if (!response.ok || !result?.case) throw new Error(result?.error || 'The record could not be saved. Your entries remain here; refresh cases before retrying.');
      merge(result.case); setUnavailable(false); setMessage('Manual record saved. No funds moved, customer messages sent, or order and stock states changed.'); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Connection failed. Refresh cases before retrying.'); return false; }
    finally { busy.current = false; setPending(false); }
  }
  async function refresh() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/order-cases?order_id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      const result = await response.json().catch(() => null) as { cases?: OrderCase[]; error?: string } | null;
      if (!response.ok || !Array.isArray(result?.cases)) throw new Error(result?.error || 'Service records could not be refreshed.');
      setCases(result.cases); setUnavailable(false); setMessage('Service records refreshed.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Connection failed. Please retry.'); }
    finally { busy.current = false; setPending(false); }
  }
  async function create() {
    requestId.current ??= crypto.randomUUID();
    const payload = { action: 'create', id: requestId.current, order_id: orderId, kind, amount_rupees: amount.trim() ? Number(amount) : 0, reason, note };
    try { const command = parseOrderCaseCommand(payload); if (command.action === 'create') assertCaseAmount(command, orderTotal); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Check the request details.'); return; }
    if (await mutate(payload)) { setCreating(false); setAmount(''); setReason(''); setNote(''); requestId.current = null; }
  }
  async function decide(record: OrderCase, next_status: Exclude<OrderCaseStatus, 'requested'>, decisionNote: string, reference: string) {
    const payload = { action: 'transition', id: record.id, next_status, note: decisionNote, external_reference: reference, expected_updated_at: record.updated_at };
    try { parseOrderCaseCommand(payload); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Check the decision details.'); return false; }
    return mutate(payload);
  }
  return <details className="mt-5 border-t border-stone-200 pt-4">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand">Cancellation, return & refund cases {cases.length > 0 && <span className="ml-1 rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-500">{cases.length}</span>}</summary>
    <div className="mt-2 space-y-3">
      <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><strong>Manual record; no funds moved.</strong> Approvals and resolutions here do not cancel orders, change stock, process refunds or send customer messages. Complete any required external action separately.</p>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-stone-500">Dates shown in IST · Requested amounts are not paid refunds</span><button type="button" disabled={pending} className={buttonClass} onClick={() => void refresh()}>{pending ? 'Working…' : 'Refresh cases'}</button></div>
      {unavailable && <p className="text-xs leading-relaxed text-stone-600">Service cases are not available in this environment yet. Existing order records are unchanged. Refresh after setup is complete.</p>}
      <div aria-live="polite">{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">{message}</p>}</div>
      {cases.map(record => <article key={record.id} className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-stone-800">{orderCaseLabels[record.kind]}</strong><span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold capitalize text-stone-600">{record.status}</span></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-700">{record.reason}</p>
        <p className="mt-2 text-xs text-stone-500">Requested amount: <strong className="text-stone-700">{formatMoney(record.requested_amount_paise)}</strong></p>
        {record.note && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-stone-500">Private note: {record.note}</p>}
        {record.decision_note && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-stone-500">Decision: {record.decision_note}</p>}
        {record.external_reference && <p className="mt-2 break-all text-xs text-stone-500">External resolution reference: <strong>{record.external_reference}</strong></p>}
        <div className="mt-3 space-y-1 text-[10px] leading-relaxed text-stone-500"><p>Requested {formatTime(record.created_at)}</p>{record.approved_at && <p>Approved {formatTime(record.approved_at)}</p>}{record.rejected_at && <p>Rejected {formatTime(record.rejected_at)}</p>}{record.resolved_at && <p>Resolution recorded {formatTime(record.resolved_at)}</p>}<p>Last updated {formatTime(record.updated_at)}</p></div>
        <CaseDecision key={`${record.id}-${record.updated_at}`} record={record} busy={pending} onSave={decide} />
      </article>)}
      {!cases.length && !unavailable && <p className="py-2 text-xs text-stone-500">No service cases recorded for this order.</p>}
      {!creating ? <button type="button" disabled={pending || unavailable} className={buttonClass} onClick={() => { setCreating(true); setError(''); setMessage(''); }}>+ Create service request</button> : <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
        <h3 className="text-sm font-semibold text-stone-800">New service request</h3>
        <fieldset disabled={pending} className="space-y-3">
          <label className="block text-xs text-stone-600">Request type<select className={`${fieldClass} mt-1`} value={kind} onChange={event => setKind(event.target.value as OrderCaseKind)}><option value="cancellation">Cancellation</option><option value="return">Return</option><option value="refund">Refund</option></select></label>
          <label className="block text-xs text-stone-600">Requested amount (₹){kind === 'refund' ? ' *' : ' — optional'}<input className={`${fieldClass} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" max={orderTotal / 100} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /><span className="mt-1 block text-[11px] text-stone-500">Maximum {formatMoney(orderTotal)}. Recording this amount does not authorize a bank transfer.</span></label>
          <label className="block text-xs text-stone-600">Reason *<textarea className={`${fieldClass} mt-1`} rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <label className="block text-xs text-stone-600">Private note<textarea className={`${fieldClass} mt-1`} rows={2} maxLength={4000} value={note} onChange={event => setNote(event.target.value)} /></label>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setCreating(false)}>Cancel</button><button type="button" className={`${buttonClass} border-brand bg-brand text-white`} disabled={!reason.trim()} onClick={() => void create()}>{pending ? 'Saving…' : 'Save request'}</button></div>
        </fieldset>
      </div>}
    </div>
  </details>;
}
