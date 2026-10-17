/**
 * Tax invoice (CGST Rules, rule 46) or, when the seller has no GSTIN, a bill of supply / receipt.
 * Pure view-model builder: callers inject the seller details and state-name lookup.
 */

export type SellerDetails = { legalName: string; address: string; gstin: string | null; stateCode: string; configured: boolean };
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function validGstin(value: unknown): value is string { return typeof value === 'string' && GSTIN.test(value); }

/** SELLER_LEGAL_NAME, SELLER_ADDRESS, SELLER_GSTIN (optional) and SELLER_STATE_CODE (default 29). A malformed GSTIN is treated as absent. */
export function sellerFromEnv(env: Record<string, string | undefined>): SellerDetails {
  const legalName = env.SELLER_LEGAL_NAME?.trim() ?? '';
  const address = env.SELLER_ADDRESS?.trim() ?? '';
  const gstin = env.SELLER_GSTIN?.trim().toUpperCase() ?? '';
  const stateCode = env.SELLER_STATE_CODE?.trim() || '29';
  return { legalName: legalName || 'PostDuty', address, gstin: validGstin(gstin) && gstin.startsWith(stateCode) ? gstin : null, stateCode, configured: Boolean(legalName && address) };
}

type Part = { taxable_value: number; cgst: number; sgst: number; igst: number };
type BreakdownLine = Part & { line_index?: number; hsn: string | null; gst_rate_bps: number | null; gross: number; shipping_share?: number; gift_share?: number; shipping?: Part; gift?: Part };
export type InvoiceOrder = {
  id: string; status: string; created_at: string; total_amount: number; invoice_number: string | null; invoice_date: string | null;
  customer_name: string; shipping_address: string;
  shipping_details?: { name?: string; address_line1?: string; address_line2?: string | null; city?: string; state?: string; state_code?: string; pincode?: string } | null;
  tax_breakdown: { regime?: string; place_of_supply?: string; lines?: BreakdownLine[] } | null;
};
export type InvoiceItem = { line_index: number | null; quantity: number; product_name?: string | null; variant_name?: string | null };
export type InvoiceRow = { description: string; hsn: string | null; quantity: number | null; rate_bps: number | null; taxable_value: number; cgst: number; sgst: number; igst: number; total: number };
export type InvoiceView = {
  kind: 'tax_invoice' | 'bill_of_supply'; title: string; number: string; date: string; orderReference: string; status: string;
  seller: { legalName: string; address: string; gstin: string | null; state: string; stateCode: string };
  buyer: { name: string; addressLines: string[]; state: string; stateCode: string };
  placeOfSupply: string; intraState: boolean;
  rows: InvoiceRow[]; totals: { taxable_value: number; cgst: number; sgst: number; igst: number; tax: number; total: number };
  inclusiveNote: string | null; reconciled: boolean;
};

const add = (a: Part, b?: Part): Part => b ? { taxable_value: a.taxable_value + b.taxable_value, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, igst: a.igst + b.igst } : a;
const zero: Part = { taxable_value: 0, cgst: 0, sgst: 0, igst: 0 };

/** Returns null for orders without an invoice number (historical orders and unpaid records). */
export function buildInvoice(order: InvoiceOrder, items: InvoiceItem[], seller: SellerDetails, stateName: (code: string) => string | null): InvoiceView | null {
  const breakdown = order.tax_breakdown;
  if (!order.invoice_number || !breakdown?.lines?.length || !breakdown.place_of_supply) return null;
  const taxInvoice = seller.gstin !== null;
  const lines = breakdown.lines;
  const row = (description: string, hsn: string | null, quantity: number | null, rate: number | null, part: Part): InvoiceRow => {
    const total = part.taxable_value + part.cgst + part.sgst + part.igst;
    return taxInvoice ? { description, hsn, quantity, rate_bps: rate, ...part, total } : { description, hsn, quantity, rate_bps: null, taxable_value: total, cgst: 0, sgst: 0, igst: 0, total };
  };
  const rows: InvoiceRow[] = [...items].filter(item => item.line_index !== null && lines[item.line_index]).sort((a, b) => a.line_index! - b.line_index!).map(item => {
    const line = lines[item.line_index!];
    const name = `${item.product_name?.trim() || 'Item'}${item.variant_name?.trim() ? ` (${item.variant_name.trim()})` : ''}`;
    return row(name, line.hsn, item.quantity, line.gst_rate_bps, line);
  });
  // Composite supply: shipping and gift card shares are taxed at each line's goods rate; one row per rate.
  for (const [key, label] of [['shipping', 'Shipping charges'], ['gift', 'Gift card']] as const) {
    const byRate = new Map<number | null, Part>();
    for (const line of lines) {
      const share = key === 'shipping' ? line.shipping_share ?? 0 : line.gift_share ?? 0;
      if (!share) continue;
      byRate.set(line.gst_rate_bps, add(byRate.get(line.gst_rate_bps) ?? zero, line[key]));
    }
    for (const [rate, part] of byRate) rows.push(row(byRate.size > 1 && taxInvoice ? `${label} (part taxed at ${(rate ?? 0) / 100}%)` : label, null, null, rate, part));
  }
  const totals = rows.reduce((t, r) => ({ taxable_value: t.taxable_value + r.taxable_value, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst, igst: t.igst + r.igst, tax: t.tax + r.cgst + r.sgst + r.igst, total: t.total + r.total }), { taxable_value: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 });
  const d = order.shipping_details;
  const structured = d?.address_line1 && d.city && d.pincode;
  const buyerState = d?.state_code ?? breakdown.place_of_supply;
  const pos = breakdown.place_of_supply;
  return {
    kind: taxInvoice ? 'tax_invoice' : 'bill_of_supply', title: taxInvoice ? 'Tax invoice' : 'Bill of supply / receipt',
    number: order.invoice_number, date: order.invoice_date ?? order.created_at, orderReference: order.id.slice(0, 8).toUpperCase(), status: order.status,
    seller: { legalName: seller.legalName, address: seller.address, gstin: seller.gstin, state: stateName(seller.stateCode) ?? seller.stateCode, stateCode: seller.stateCode },
    buyer: {
      name: d?.name?.trim() || order.customer_name,
      addressLines: structured ? [d.address_line1!, d.address_line2 ?? '', `${d.city} - ${d.pincode}`].filter(Boolean) : [order.shipping_address],
      state: d?.state ?? stateName(buyerState) ?? buyerState, stateCode: buyerState,
    },
    placeOfSupply: `${stateName(pos) ?? pos} (${pos})`, intraState: breakdown.regime === 'intra_state',
    rows, totals, inclusiveNote: taxInvoice ? 'Prices are inclusive of GST.' : null,
    // The invoice must add up to the amount the customer paid.
    reconciled: totals.total === order.total_amount,
  };
}
