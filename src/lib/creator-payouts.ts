/**
 * Creator payouts under the buy-and-resell model: PostDuty buys each item from the creator and resells it
 * in its own name. Pure functions only (no I/O) so every rule is unit-tested.
 *
 * Per creator line:
 *   payout = (line value after discount + allocated shipping charged)
 *            − allocated GST − allocated payment fee − allocated actual courier cost − platform fee
 * Cancelled and refunded lines pay 0. Until the owner enters the order's actual courier cost the
 * payout is "pending courier cost". The gift card belongs to PostDuty and is not part of any payout.
 */

export type PayoutConfig = { paymentFeeBps: number; platformFeeBps: number };
const bps = (value: string | undefined, fallback: number) => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 10000) throw new Error('Fee basis points must be a whole number from 0 to 10000.');
  return parsed;
};
/** PAYMENT_FEE_BPS defaults to 236 (2% gateway fee + 18% GST on it); PLATFORM_FEE_BPS defaults to 0. */
export function payoutConfig(env: Record<string, string | undefined>): PayoutConfig {
  return { paymentFeeBps: bps(env.PAYMENT_FEE_BPS, 236), platformFeeBps: bps(env.PLATFORM_FEE_BPS, 0) };
}

type Part = { cgst: number; sgst: number; igst: number };
export type PayoutBreakdownLine = { line_index?: number; gross: number; shipping_share?: number; cgst: number; sgst: number; igst: number; shipping?: Part };
export type PayoutOrder = {
  id: string; status: string; created_at: string; courier_cost_paise: number | null;
  tax_breakdown: { gst_registered?: boolean; lines?: PayoutBreakdownLine[] } | null;
};
export type PayoutItem = {
  id: string; order_id: string; creator_id: string | null; line_index: number | null; quantity: number;
  product_name?: string | null; settlement_id?: string | null; creator_payout_paise?: number | null;
};
export type PayoutStatus = 'ready' | 'pending_courier_cost' | 'cancelled' | 'refunded' | 'unavailable' | 'settled';
export type PayoutLine = {
  order_item_id: string; order_id: string; order_date: string; product_name: string; quantity: number;
  line_value: number; shipping_share: number; gst: number; payment_fee: number; courier_cost: number | null; platform_fee: number;
  payout_paise: number | null; status: PayoutStatus; settlement_id: string | null;
};

function roundDiv(numerator: number, denominator: number) { return Math.floor((2 * numerator + denominator) / (2 * denominator)); }
/** Largest remainder; ties to the earlier line; all-zero weights split equally. */
export function allocate(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const basis = weights.some(w => w > 0) ? weights : weights.map(() => 1);
  const sum = basis.reduce((a, b) => a + b, 0);
  const shares = basis.map((w, index) => ({ index, paise: Math.floor(total * w / sum), remainder: (total * w) % sum }));
  const residual = total - shares.reduce((a, s) => a + s.paise, 0);
  [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index).slice(0, residual).forEach(s => { shares[s.index].paise++; });
  return shares.map(s => s.paise);
}
const tax = (p?: Part) => p ? p.cgst + p.sgst + p.igst : 0;

/** Payout lines for every creator-supplied item of one order. Courier cost is shared across all order lines. */
export function orderPayoutLines(order: PayoutOrder, items: PayoutItem[], config: PayoutConfig): PayoutLine[] {
  const lines = order.tax_breakdown?.lines ?? [];
  const charged = lines.map(line => line.gross + (line.shipping_share ?? 0));
  const courierShares = order.courier_cost_paise === null ? null : allocate(order.courier_cost_paise, charged);
  const registered = order.tax_breakdown?.gst_registered === true;
  return items.filter(item => item.creator_id).map(item => {
    const base = { order_item_id: item.id, order_id: order.id, order_date: order.created_at, product_name: item.product_name?.trim() || 'Item', quantity: item.quantity, settlement_id: item.settlement_id ?? null };
    const line = item.line_index === null ? undefined : lines[item.line_index];
    if (!line) return { ...base, line_value: 0, shipping_share: 0, gst: 0, payment_fee: 0, courier_cost: null, platform_fee: 0, payout_paise: null, status: 'unavailable' as const };
    const shippingShare = line.shipping_share ?? 0;
    const lineCharged = line.gross + shippingShare;
    // Not GST-registered: no GST is collected or remitted, so none is deducted.
    const gst = registered ? tax(line) + tax(line.shipping) : 0;
    const paymentFee = roundDiv(lineCharged * config.paymentFeeBps, 10000);
    const platformFee = roundDiv(line.gross * config.platformFeeBps, 10000);
    const courier = courierShares ? courierShares[item.line_index!] : null;
    const amounts = { line_value: line.gross, shipping_share: shippingShare, gst, payment_fee: paymentFee, courier_cost: courier, platform_fee: platformFee };
    if (order.status === 'cancelled' || order.status === 'refunded') return { ...base, ...amounts, payout_paise: 0, status: order.status };
    if (!['paid', 'shipped', 'delivered'].includes(order.status)) return { ...base, ...amounts, payout_paise: null, status: 'unavailable' as const };
    if (courier === null) return { ...base, ...amounts, payout_paise: null, status: 'pending_courier_cost' as const };
    // A payout never goes negative; a shortfall is visible from the line amounts.
    const payout = Math.max(0, lineCharged - gst - paymentFee - courier - platformFee);
    // A settled line shows the amount frozen into its settlement.
    if (item.settlement_id) return { ...base, ...amounts, payout_paise: item.creator_payout_paise ?? payout, status: 'settled' as const };
    return { ...base, ...amounts, payout_paise: payout, status: 'ready' as const };
  });
}

const DAY = 86400000;
/** Monday-to-Sunday week in India Standard Time containing `date` (YYYY-MM-DD). */
export function istWeek(date: string): { start: string; end: string; fromIso: string; toIso: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Choose a valid week.');
  const day = Date.parse(`${date}T00:00:00Z`);
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const offset = 330 * 60000;
  return { start: iso(monday), end: iso(monday + 6 * DAY), fromIso: new Date(monday - offset).toISOString(), toIso: new Date(monday + 7 * DAY - offset).toISOString() };
}

export type WeeklyStatement = {
  creator_id: string; period_start: string; period_end: string; lines: PayoutLine[];
  payable_paise: number; payable_lines: number; pending_courier_lines: number; settled_paise: number;
};
export function weeklyStatement(creatorId: string, week: string, orders: PayoutOrder[], items: PayoutItem[], config: PayoutConfig): WeeklyStatement {
  const range = istWeek(week);
  const inWeek = orders.filter(o => o.created_at >= range.fromIso && o.created_at < range.toIso);
  const lines = inWeek.flatMap(order => orderPayoutLines(order, items.filter(i => i.order_id === order.id && i.creator_id === creatorId), config))
    .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.order_item_id.localeCompare(b.order_item_id));
  const payable = lines.filter(l => l.status === 'ready');
  return {
    creator_id: creatorId, period_start: range.start, period_end: range.end, lines,
    payable_paise: payable.reduce((a, l) => a + (l.payout_paise ?? 0), 0), payable_lines: payable.length,
    pending_courier_lines: lines.filter(l => l.status === 'pending_courier_cost').length,
    settled_paise: lines.filter(l => l.status === 'settled').reduce((a, l) => a + (l.payout_paise ?? 0), 0),
  };
}

/** Owner-entered actual courier cost in rupees → integer paise (null clears it). */
export function parseCourierCost(value: unknown): number | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000 || Math.abs(Math.round(value * 100) - value * 100) > 1e-6) throw new Error('Enter the courier cost in rupees, up to two decimal places.');
  return Math.round(value * 100);
}

/** Settlement payment record: date (not in the future) and UPI/bank reference. */
export function parseSettlementPayment(body: Record<string, unknown>, today = new Date()): { paid_on: string; reference: string } {
  const paidOn = typeof body.paid_on === 'string' ? body.paid_on : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00Z`))) throw new Error('Enter the payment date.');
  const latest = new Date(today.getTime() + 330 * 60000).toISOString().slice(0, 10);
  if (paidOn > latest) throw new Error('The payment date cannot be in the future.');
  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9 /._-]{2,79}$/.test(reference)) throw new Error('Enter the UPI or bank transaction reference (3–80 letters, numbers, spaces, / . _ -).');
  return { paid_on: paidOn, reference };
}
