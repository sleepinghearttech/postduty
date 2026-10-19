import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { gstBreakdown, allocateByWeight, buildCheckoutSnapshot, parseCheckoutRequest, stateName } from '../../src/lib/checkout-contract.ts';
import { orderPayoutLines, weeklyStatement, payoutConfig, istWeek, parseCourierCost, parseSettlementPayment, allocate } from '../../src/lib/creator-payouts.ts';
import { buildInvoice, sellerFromEnv, validGstin } from '../../src/lib/tax-invoice.ts';
import { validateCreatorProfile, validatePickupAddress, madeByLine, PUBLIC_CREATOR_COLUMNS } from '../../src/lib/creator-profile.ts';

const A = '10000000-0000-4000-8000-00000000000a', B = '10000000-0000-4000-8000-00000000000b';
const lineA = { product_id: A, quantity: 1, unit_price: 30000, line_discount_amount: 0, hsn: '7117', gst_rate_bps: 300 };
const lineB = { product_id: B, quantity: 1, unit_price: 10000, line_discount_amount: 0, hsn: '9503', gst_rate_bps: 1200 };
const plain = value => JSON.parse(JSON.stringify(value));

// ─── composite-supply tax ───────────────────────────────────────────────────
test('largest-remainder allocation accounts for every paisa; ties go to the earlier line; zero weights split equally', () => {
  assert.deepEqual(allocateByWeight(4900, [30000, 10000]), [3675, 1225]);
  assert.deepEqual(allocateByWeight(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateByWeight(5, [0, 0]), [3, 2]);
  assert.deepEqual(allocateByWeight(0, [5, 7]), [0, 0]);
  for (const [total, weights] of [[4901, [3, 7, 11]], [2000, [25000, 1, 9999]], [1, [5, 5]]]) assert.equal(allocateByWeight(total, weights).reduce((a, b) => a + b, 0), total);
  assert.deepEqual(allocate(4900, [30000, 10000]), allocateByWeight(4900, [30000, 10000]));
});
test('shipping and gift are allocated by line value after discount and taxed at each line’s goods rate', () => {
  const b = gstBreakdown([lineA, lineB], '29', '29', true, { shipping: 4900, gift: 2000 });
  assert.equal(b.basis, 'composite_supply_v2');
  assert.deepEqual(b.lines.map(l => [l.shipping_share, l.gift_share]), [[3675, 1500], [1225, 500]]);
  // Each half: 3675 × 300 / 20600 = 53.52 → 54; 1225 × 1200 / 22400 = 65.63 → 66 (half-up).
  assert.deepEqual(b.lines.map(l => [l.shipping.cgst, l.shipping.sgst]), [[54, 54], [66, 66]]);
  assert.deepEqual(b.lines.map(l => [l.gift.cgst, l.gift.sgst]), [[22, 22], [27, 27]]);
  assert.equal(b.charges.shipping.amount, 4900); assert.equal(b.charges.gift.amount, 2000);
  assert.equal(b.charges.shipping.cgst, 120); assert.equal(b.charges.shipping.taxable_value + b.charges.shipping.cgst + b.charges.shipping.sgst, 4900);
  // Everything the customer pays is either taxable value or tax.
  assert.equal(b.taxable_value + b.total_tax, 30000 + 10000 + 4900 + 2000);
  const inter = gstBreakdown([lineA, lineB], '32', '29', true, { shipping: 4900 });
  assert.equal(inter.cgst + inter.sgst, 0); assert.deepEqual(inter.lines.map(l => l.shipping.igst), [107, 131]);
  // Discounted lines carry less shipping: allocation is by value after discount.
  const discounted = gstBreakdown([{ ...lineA, line_discount_amount: 20000 }, lineB], '29', '29', true, { shipping: 4900 });
  assert.deepEqual(discounted.lines.map(l => l.shipping_share), [2450, 2450]);
  // A fully discounted basket still allocates deterministically (pre-discount value).
  const free = gstBreakdown([{ ...lineA, line_discount_amount: 30000 }, { ...lineB, line_discount_amount: 10000 }], '29', '29', true, { shipping: 4900 });
  assert.deepEqual(free.lines.map(l => l.shipping_share), [3675, 1225]);
});
test('checkout snapshot taxes shipping and the gift card as part of the goods', () => {
  const products = [{ id: A, name: 'Fictional A', price: 30000, stock: 5, is_active: true, commerce: { storefronts: ['general'], hsn: '7117', gst_rate_bps: 300 } }];
  const request = parseCheckoutRequest({ items: [{ productId: A, quantity: 1 }], isGift: true, customerName: 'Test Buyer', customerEmail: 'b@example.invalid', customerPhone: '9876543210', addressLine1: '1 Fictional St', city: 'Testpur', stateCode: '29', pincode: '560001', acceptTerms: true });
  const s = buildCheckoutSnapshot(request, products, null, Date.now(), [], { sellerStateCode: '29', gstRegistered: true });
  assert.equal(s.taxBreakdown.charges.shipping.amount, 4900); assert.equal(s.taxBreakdown.charges.gift.amount, 2000);
  assert.equal(s.taxBreakdown.taxable_value + s.taxBreakdown.total_tax, s.totalAmount);
});

// ─── payouts ────────────────────────────────────────────────────────────────
const creator = '40000000-0000-4000-8000-0000000000c1';
const breakdown = gstBreakdown([lineA, lineB], '29', '29', true, { shipping: 0, gift: 2000 });
const order = { id: '30000000-0000-4000-8000-0000000000d1', status: 'delivered', created_at: '2026-10-14T06:00:00.000Z', courier_cost_paise: 8000, tax_breakdown: breakdown };
const items = [
  { id: 'item-a', order_id: order.id, creator_id: creator, line_index: 0, quantity: 1, product_name: 'Fictional A' },
  { id: 'item-b', order_id: order.id, creator_id: null, line_index: 1, quantity: 1, product_name: 'PostDuty B' },
];
test('payout = (line value + shipping share) − GST − payment fee − courier share − platform fee; gift card excluded', () => {
  const config = { paymentFeeBps: 236, platformFeeBps: 0 };
  const [line] = plain(orderPayoutLines(order, items, config));
  assert.equal(line.line_value, 30000); assert.equal(line.shipping_share, 0);
  assert.equal(line.gst, 874);            // 30000 at 3% inclusive: CGST 437 + SGST 437
  assert.equal(line.payment_fee, 708);    // 30000 × 2.36%
  assert.equal(line.courier_cost, 6000);  // 8000 split 30000:10000 across all order lines
  assert.equal(line.platform_fee, 0);
  assert.equal(line.payout_paise, 30000 - 874 - 708 - 6000 - 0);
  assert.equal(line.status, 'ready');
  const withPlatform = plain(orderPayoutLines(order, items, { paymentFeeBps: 236, platformFeeBps: 1000 }))[0];
  assert.equal(withPlatform.platform_fee, 3000); assert.equal(withPlatform.payout_paise, line.payout_paise - 3000);
  // With shipping charged on a single-unit order, the creator line receives its shipping share.
  const single = gstBreakdown([lineA], '29', '29', true, { shipping: 4900 });
  const shipped = plain(orderPayoutLines({ ...order, tax_breakdown: single, courier_cost_paise: 4500 }, [items[0]], config))[0];
  assert.equal(shipped.shipping_share, 4900); assert.equal(shipped.gst, 874 + 2 * 71);
  assert.equal(shipped.payout_paise, 34900 - (874 + 142) - 824 - 4500);
});
test('payout is pending until the courier cost is entered; cancelled/refunded pay 0; not-registered sellers deduct no GST', () => {
  const config = payoutConfig({});
  assert.deepEqual(config, { paymentFeeBps: 236, platformFeeBps: 0 });
  assert.equal(plain(orderPayoutLines({ ...order, courier_cost_paise: null }, items, config))[0].status, 'pending_courier_cost');
  assert.equal(plain(orderPayoutLines({ ...order, courier_cost_paise: null }, items, config))[0].payout_paise, null);
  for (const status of ['cancelled', 'refunded']) assert.deepEqual(plain(orderPayoutLines({ ...order, status }, items, config)).map(l => [l.status, l.payout_paise]), [[status, 0]]);
  assert.equal(plain(orderPayoutLines({ ...order, status: 'pending' }, items, config))[0].status, 'unavailable');
  assert.equal(plain(orderPayoutLines({ ...order, tax_breakdown: null }, items, config))[0].status, 'unavailable');
  const unregistered = plain(orderPayoutLines({ ...order, tax_breakdown: { ...breakdown, gst_registered: false } }, items, config))[0];
  assert.equal(unregistered.gst, 0); assert.equal(unregistered.payout_paise, 30000 - 708 - 6000);
  // Payouts never go negative.
  assert.equal(plain(orderPayoutLines({ ...order, courier_cost_paise: 1000000 }, items, config))[0].payout_paise, 0);
  assert.deepEqual(payoutConfig({ PAYMENT_FEE_BPS: '200', PLATFORM_FEE_BPS: '500' }), { paymentFeeBps: 200, platformFeeBps: 500 });
  for (const bad of ['-1', '1.5', '10001', 'x']) assert.throws(() => payoutConfig({ PLATFORM_FEE_BPS: bad }), /basis points/);
});
test('weekly statement: IST Monday–Sunday, payable total of ready lines, settled lines keep their frozen amount', () => {
  assert.deepEqual(plain(istWeek('2026-10-14')), { start: '2026-10-12', end: '2026-10-18', fromIso: '2026-10-11T18:30:00.000Z', toIso: '2026-10-18T18:30:00.000Z' });
  assert.equal(istWeek('2026-10-18').start, '2026-10-12'); assert.equal(istWeek('2026-10-19').start, '2026-10-19');
  assert.throws(() => istWeek('14/10/2026'), /valid week/);
  const config = payoutConfig({});
  const pending = { ...order, id: '30000000-0000-4000-8000-0000000000d2', courier_cost_paise: null };
  const cancelled = { ...order, id: '30000000-0000-4000-8000-0000000000d3', status: 'cancelled' };
  const nextWeek = { ...order, id: '30000000-0000-4000-8000-0000000000d4', created_at: '2026-10-18T18:30:00.000Z' };
  const allItems = [order, pending, cancelled, nextWeek].flatMap(o => items.map(i => ({ ...i, id: `${i.id}-${o.id.slice(-2)}`, order_id: o.id })));
  const s = plain(weeklyStatement(creator, '2026-10-15', [order, pending, cancelled, nextWeek], allItems, config));
  assert.equal(s.period_start, '2026-10-12'); assert.equal(s.lines.length, 3);
  assert.deepEqual(s.lines.map(l => l.status).sort(), ['cancelled', 'pending_courier_cost', 'ready']);
  assert.equal(s.payable_lines, 1); assert.equal(s.payable_paise, 30000 - 874 - 708 - 6000); assert.equal(s.pending_courier_lines, 1);
  const settled = plain(weeklyStatement(creator, '2026-10-15', [order], [{ ...items[0], settlement_id: 'settled-1', creator_payout_paise: 12345 }], config));
  assert.equal(settled.lines[0].status, 'settled'); assert.equal(settled.lines[0].payout_paise, 12345); assert.equal(settled.payable_paise, 0); assert.equal(settled.settled_paise, 12345);
});
test('courier cost and settlement payment inputs are validated', () => {
  assert.equal(parseCourierCost(65.5), 6550); assert.equal(parseCourierCost(0), 0); assert.equal(parseCourierCost(null), null); assert.equal(parseCourierCost(''), null);
  for (const bad of [-1, 1.234, '65', NaN, 100001]) assert.throws(() => parseCourierCost(bad), /courier cost/);
  const today = new Date('2026-10-18T06:00:00Z');
  assert.deepEqual(parseSettlementPayment({ paid_on: '2026-10-18', reference: ' UPI/123456789 ' }, today), { paid_on: '2026-10-18', reference: 'UPI/123456789' });
  assert.throws(() => parseSettlementPayment({ paid_on: '2026-10-19', reference: 'UPI123' }, today), /future/);
  assert.throws(() => parseSettlementPayment({ paid_on: '', reference: 'UPI123' }, today), /payment date/);
  for (const reference of ['', 'ab', '<script>', 'x'.repeat(81)]) assert.throws(() => parseSettlementPayment({ paid_on: '2026-10-18', reference }, today), /reference/);
});

// ─── invoice ────────────────────────────────────────────────────────────────
const invoiceBreakdown = gstBreakdown([lineA, lineB], '29', '29', true, { shipping: 0, gift: 2000 });
const invoiceOrder = { id: order.id, status: 'paid', created_at: '2026-10-14T06:00:00Z', total_amount: 42000, invoice_number: 'PD/2026-27/0001', invoice_date: '2026-10-14T06:00:01Z', customer_name: 'Fictional Buyer', shipping_address: '1 Fictional St, Testpur, Karnataka - 560001', shipping_details: { name: 'Fictional Buyer', address_line1: '1 Fictional St', address_line2: null, city: 'Testpur', state: 'Karnataka', state_code: '29', pincode: '560001' }, tax_breakdown: invoiceBreakdown };
const invoiceItems = [{ line_index: 1, quantity: 1, product_name: 'PostDuty B', variant_name: 'Blue' }, { line_index: 0, quantity: 1, product_name: 'Fictional A', variant_name: null }];
const sellerEnv = { SELLER_LEGAL_NAME: 'Fictional Trader', SELLER_ADDRESS: '1 Example Road, Bengaluru 560001', SELLER_GSTIN: '29ABCDE1234F1Z5' };
test('tax invoice: seller GSTIN, buyer state code, place of supply, per-line HSN/rate/CGST/SGST, gift line, totals reconcile', () => {
  assert.equal(validGstin('29ABCDE1234F1Z5'), true); assert.equal(validGstin('29abcde1234f1z5'), false);
  const seller = sellerFromEnv(sellerEnv);
  const invoice = plain(buildInvoice(invoiceOrder, invoiceItems, seller, stateName));
  assert.equal(invoice.kind, 'tax_invoice'); assert.equal(invoice.title, 'Tax invoice'); assert.equal(invoice.number, 'PD/2026-27/0001');
  assert.deepEqual(invoice.seller, { legalName: 'Fictional Trader', address: '1 Example Road, Bengaluru 560001', gstin: '29ABCDE1234F1Z5', state: 'Karnataka', stateCode: '29' });
  assert.deepEqual(invoice.buyer, { name: 'Fictional Buyer', addressLines: ['1 Fictional St', 'Testpur - 560001'], state: 'Karnataka', stateCode: '29' });
  assert.equal(invoice.placeOfSupply, 'Karnataka (29)'); assert.equal(invoice.intraState, true);
  assert.deepEqual(invoice.rows.map(r => [r.description, r.hsn, r.quantity, r.rate_bps]), [['Fictional A', '7117', 1, 300], ['PostDuty B (Blue)', '9503', 1, 1200], ['Gift card (part taxed at 3%)', null, null, 300], ['Gift card (part taxed at 12%)', null, null, 1200]]);
  assert.deepEqual([invoice.rows[0].cgst, invoice.rows[0].sgst, invoice.rows[0].igst], [437, 437, 0]);
  for (const row of invoice.rows) assert.equal(row.taxable_value + row.cgst + row.sgst + row.igst, row.total);
  assert.equal(invoice.totals.total, 42000); assert.equal(invoice.reconciled, true);
  assert.equal(invoice.inclusiveNote, 'Prices are inclusive of GST.');
  const inter = plain(buildInvoice({ ...invoiceOrder, tax_breakdown: gstBreakdown([lineA, lineB], '32', '29', true, { gift: 2000 }), shipping_details: { ...invoiceOrder.shipping_details, state: 'Kerala', state_code: '32' } }, invoiceItems, seller, stateName));
  assert.equal(inter.intraState, false); assert.equal(inter.placeOfSupply, 'Kerala (32)'); assert.equal(inter.totals.cgst + inter.totals.sgst, 0); assert.ok(inter.totals.igst > 0);
});
test('without a valid GSTIN the document is a bill of supply / receipt with no tax lines; legacy orders get no invoice', () => {
  for (const env of [{ ...sellerEnv, SELLER_GSTIN: '' }, { ...sellerEnv, SELLER_GSTIN: 'NOT-A-GSTIN' }, { ...sellerEnv, SELLER_GSTIN: '32ABCDE1234F1Z5' }]) {
    const invoice = plain(buildInvoice(invoiceOrder, invoiceItems, sellerFromEnv(env), stateName));
    assert.equal(invoice.kind, 'bill_of_supply'); assert.equal(invoice.title, 'Bill of supply / receipt'); assert.equal(invoice.seller.gstin, null);
    assert.equal(invoice.totals.tax, 0); assert.ok(invoice.rows.every(r => r.cgst + r.sgst + r.igst === 0 && r.rate_bps === null));
    assert.equal(invoice.totals.total, 42000); assert.equal(invoice.inclusiveNote, null);
  }
  assert.equal(sellerFromEnv({}).configured, false);
  assert.equal(buildInvoice({ ...invoiceOrder, invoice_number: null }, invoiceItems, sellerFromEnv(sellerEnv), stateName), null);
  assert.equal(buildInvoice({ ...invoiceOrder, tax_breakdown: null }, invoiceItems, sellerFromEnv(sellerEnv), stateName), null);
  assert.equal(buildInvoice({ ...invoiceOrder, total_amount: 41999 }, invoiceItems, sellerFromEnv(sellerEnv), stateName).reconciled, false);
});
test('customer invoice API requires the same order ID + checkout phone verification and leaks nothing otherwise', async () => {
  const orderId = order.id;
  let loads = 0;
  const invoice = { number: 'PD/2026-27/0001' };
  const load = (loaded) => {
    const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/app/api/order-invoice/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const module = { exports: {} };
    const deps = {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers }) } },
      '@/lib/invoice-data': { loadInvoice: async id => { loads++; return id === orderId ? loaded : null; } },
      '@/lib/order-tracking': { normalizeTrackingPhone: value => typeof value === 'string' && value.replace(/\D/g, '').length >= 10 ? value.replace(/\D/g, '').slice(-10) : null },
      '@/components/commerce/order-outcome': { validOrderReference: value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) },
    };
    new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => deps[id], JSON }));
    return module.exports.POST;
  };
  const request = body => ({ headers: new Headers(), text: async () => JSON.stringify(body) });
  const post = load({ invoice, customerPhone: '+91 90000 00000' });
  const ok = await post(request({ orderId, phone: '9000000000' }));
  assert.equal(ok.status, 200); assert.equal(ok.body.invoice.number, 'PD/2026-27/0001'); assert.equal(ok.headers['Cache-Control'], 'private, no-store');
  const wrong = await post(request({ orderId, phone: '9111111111' }));
  assert.equal(wrong.status, 404); assert.equal(wrong.body.invoice, undefined);
  const unknown = await post(request({ orderId: '30000000-0000-4000-8000-0000000000ff', phone: '9000000000' }));
  assert.deepEqual([unknown.status, unknown.body.error], [wrong.status, wrong.body.error]);
  const unnumbered = await load({ invoice: null, customerPhone: '9000000000' })(request({ orderId, phone: '9000000000' }));
  assert.deepEqual([unnumbered.status, unnumbered.body.error], [wrong.status, wrong.body.error]);
  const before = loads;
  assert.equal((await post(request({ orderId: 'bad', phone: '9000000000' }))).status, 400);
  assert.equal((await post(request({ orderId, phone: '12' }))).status, 400);
  assert.equal(loads, before);
});

// ─── creator profile and pickup ─────────────────────────────────────────────
test('public creator profile: only owner-approved fields and an https photo; publishing needs only the display name', () => {
  assert.equal(PUBLIC_CREATOR_COLUMNS, 'id,display_name,bio,photo_url,profession');
  const profile = validateCreatorProfile({ display_name: ' Fictional Maker ', bio: 'Makes things after night shifts.', profession: 'Staff nurse', photo_url: 'https://example.invalid/p.jpg', profile_published: true, email: 'leak@example.invalid', commission_bps: 0 });
  assert.deepEqual(profile, { display_name: 'Fictional Maker', bio: 'Makes things after night shifts.', photo_url: 'https://example.invalid/p.jpg', profession: 'Staff nurse', profile_published: true });
  // The storefront credit never includes the profession.
  assert.equal(madeByLine(profile), 'Made by Fictional Maker');
  assert.equal(madeByLine({ display_name: 'Fictional Maker', profession: null }), 'Made by Fictional Maker');
  assert.deepEqual(validateCreatorProfile({ display_name: 'Fictional Maker', profile_published: true }), { display_name: 'Fictional Maker', bio: '', photo_url: null, profession: null, profile_published: true });
  assert.equal(validateCreatorProfile({ display_name: 'Fictional Maker', profile_published: false }).photo_url, null);
  for (const patch of [{ photo_url: 'http://example.invalid/p.jpg' }, { photo_url: 'javascript:alert(1)' }, { bio: '<script>' }, { display_name: 'A' }, { profile_published: 'yes' }, { profession: 'x'.repeat(81) }])
    assert.throws(() => validateCreatorProfile({ display_name: 'Fictional Maker', bio: 'Story', profession: 'Nurse', profile_published: false, ...patch }));
});
test('private pickup address: Indian mobile, 6-digit PIN, safe Shiprocket location code', () => {
  assert.deepEqual(validatePickupAddress({ pickup_name: 'Fictional Maker', phone: '+91 98765-43210', address: 'Fictional workshop, Test Road', pincode: '560001', shiprocket_location: 'FICTIONAL_1' }), { pickup_name: 'Fictional Maker', phone: '9876543210', address: 'Fictional workshop, Test Road', pincode: '560001', shiprocket_location: 'FICTIONAL_1' });
  assert.equal(validatePickupAddress({ pickup_name: 'Fictional Maker', phone: '09876543210', address: 'Fictional workshop, Test Road', pincode: '560001' }).shiprocket_location, null);
  for (const patch of [{ phone: '12345' }, { phone: '5876543210' }, { pincode: '056000' }, { address: 'short' }, { shiprocket_location: 'bad;drop' }, { pickup_name: '' }])
    assert.throws(() => validatePickupAddress({ pickup_name: 'Fictional Maker', phone: '9876543210', address: 'Fictional workshop, Test Road', pincode: '560001', ...patch }));
});
test('product page reads creators through the public (anon) client with the restricted column list only', () => {
  const source = readFileSync(new URL('../../src/components/commerce/catalog-data.ts', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('export async function getCreatorProfile'));
  assert.match(fn, /supabase\.from\(commerceTable\('creators'\)\)\.select\(STOREFRONT_CREATOR_COLUMNS\)/);
  assert.doesNotMatch(source, /supabaseAdmin/);
});
