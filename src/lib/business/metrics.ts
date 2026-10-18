export type BusinessOrder = { id: string; created_at: string; total_amount: number; status: string; storefront?: string; payment_mode?: string; is_test?: boolean };
export type BusinessItem = { id: string; order_id: string; product_id: string; quantity: number; unit_price: number; creator_id?: string | null; fulfillment_status?: string; name_snapshot?: string | null; earnings_creator_id?:string|null; earnings_review_required?:boolean; line_discount_amount?:number|null; commission_amount?:number|null; creator_earning_paise?:number|null };
export type PaymentEvidence = { order_id: string | null; status: string; provider_verified_at?: string | null; amount: number; currency: string; is_test: boolean };
export type BusinessProduct = { id: string; name: string; stock: number; price: number; is_active: boolean; creator_id?: string | null; commerce?: { category?: string; low_stock_threshold?: number; archived?: boolean; variants?: {stock:number}[] } };
export type ResearchInsight = { id: string; title: string; finding: string; source_url: string; researched_at: string; confidence: 'low'|'medium'|'high'; expected_benefit: string; effort: string; risks: string; next_action: string; product_id: string | null; status: 'proposed'|'accepted'|'rejected'|'testing'|'completed'; evidence_type: 'fact'|'estimate'|'hypothesis'; created_at: string };
export type BusinessRange = { from: string; to: string; start: string; end: string; previousStart: string; days: number };
export const currency = (paise: number) => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:2 }).format(paise / 100);
const dayMs = 86400000;
export function indiaDay(date = new Date()): string { return new Date(date.getTime() + 19800000).toISOString().slice(0,10); }
function validDay(value?: string): value is string { return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function businessRange(from?: string, to?: string, now = new Date()): BusinessRange {
  const today = indiaDay(now);
  const last = validDay(to) && to <= today ? to : today;
  const defaultFirst = new Date(Date.parse(last) - 29 * dayMs).toISOString().slice(0,10);
  const first = validDay(from) && from <= last && Date.parse(last)-Date.parse(from) < 366 * dayMs ? from : defaultFirst;
  const start = Date.parse(`${first}T00:00:00+05:30`);
  const end = Date.parse(`${last}T00:00:00+05:30`) + dayMs;
  return { from:first, to:last, start:new Date(start).toISOString(), end:new Date(end).toISOString(), previousStart:new Date(start - (end-start)).toISOString(), days:(end-start)/dayMs };
}
export function verifiedMode(order: BusinessOrder, evidence: PaymentEvidence[]): 'test'|'live'|'unknown' {
  if (!['paid','shipped','delivered'].includes(order.status) || typeof order.is_test !== 'boolean') return 'unknown';
  const mode = order.is_test ? 'test' : 'live';
  // The base commerce schema has is_test; payment_mode is additive. A matching
  // capture supplies independent mode proof when the optional text field is absent.
  if (order.payment_mode != null && order.payment_mode !== mode) return 'unknown';
  return evidence.some(p => p.order_id === order.id && p.status === 'captured' && !!p.provider_verified_at && Number.isFinite(Date.parse(p.provider_verified_at)) && p.amount === order.total_amount && p.currency === 'INR' && p.is_test === order.is_test) ? mode : 'unknown';
}
export function summarizeBusiness(orders: BusinessOrder[], items: BusinessItem[], evidence: PaymentEvidence[], products: BusinessProduct[], range: BusinessRange, mode: 'test'|'live') {
  const within = (order: BusinessOrder, previous = false) => Date.parse(order.created_at) >= Date.parse(previous ? range.previousStart : range.start) && Date.parse(order.created_at) < Date.parse(previous ? range.start : range.end);
  const current = orders.filter(o => within(o));
  const paid = current.filter(o => verifiedMode(o,evidence) === mode);
  const previous = orders.filter(o => within(o,true) && verifiedMode(o,evidence) === mode);
  const total = (rows: BusinessOrder[]) => rows.reduce((sum,o) => sum + o.total_amount, 0);
  const revenue = total(paid); const previousRevenue = total(previous);
  const ids = new Set(paid.map(o => o.id));
  const paidItems = items.filter(i => ids.has(i.order_id));
  const productMap = new Map(products.map(p=>[p.id,p]));
  const ranks = new Map<string,{id:string;name:string;units:number;gross:number;category:string}>();
  const creatorRanks=new Map<string,{creator_id:string|null;attribution:'creator'|'postduty'|'unknown';gross:number;units:number;reviewItems:number}>();
  for (const item of paidItems) {
    const product = productMap.get(item.product_id);
    const row = ranks.get(item.product_id) ?? {id:item.product_id,name:item.name_snapshot || product?.name || 'Archived product',units:0,gross:0,category:product?.commerce?.category || 'Uncategorized'};
    row.units += item.quantity; row.gross += item.unit_price * item.quantity; ranks.set(item.product_id,row);
    const attribution=item.earnings_creator_id?'creator':item.creator_id||item.earnings_review_required?'unknown':'postduty';
    const key=item.earnings_creator_id??attribution;
    const creator=creatorRanks.get(key)??{creator_id:item.earnings_creator_id??null,attribution,gross:0,units:0,reviewItems:0};
    creator.gross+=item.quantity*item.unit_price;creator.units+=item.quantity;if(item.earnings_review_required)creator.reviewItems++;
    creatorRanks.set(key,creator);
  }
  const daily = Array.from({length:range.days},(_,index)=>({day:new Date(Date.parse(range.from)+index*dayMs).toISOString().slice(0,10),revenue:0,orders:0}));
  const dailyMap = new Map(daily.map(d=>[d.day,d]));
  for (const order of paid) { const day = dailyMap.get(indiaDay(new Date(order.created_at))); if(day) {day.revenue+=order.total_amount;day.orders++;} }
  return {
    revenue, paidCount:paid.length, previousRevenue, previousPaidCount:previous.length,
    revenueChangePercent:previousRevenue > 0 ? (revenue - previousRevenue) / previousRevenue * 100 : null,
    averageOrderValue:paid.length ? revenue / paid.length : null,
    unverifiedCount:current.filter(o=>['paid','shipped','delivered'].includes(o.status) && verifiedMode(o,evidence)==='unknown').length,
    otherModeCount:current.filter(o=>verifiedMode(o,evidence)===(mode==='test'?'live':'test')).length,
    pendingCount:current.filter(o=>o.status==='pending').length,
    toDispatch:paid.filter(o=>o.status==='paid').length,
    storefronts:['general','christmas','unknown'].map(storefront=>({storefront,orders:paid.filter(o=>(o.storefront || 'unknown')===storefront).length,revenue:total(paid.filter(o=>(o.storefront || 'unknown')===storefront))})),
    ranks:[...ranks.values()].sort((a,b)=>b.gross-a.gross), creatorRanks:[...creatorRanks.values()].sort((a,b)=>b.gross-a.gross), daily,
  };
}
/** Quote every cell and neutralize spreadsheet formulas, including leading whitespace. */
export function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g,'""')}"`;
}
