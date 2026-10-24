import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as contract from '../../src/lib/checkout-contract.ts';
import { validateCommerce } from '../../src/lib/product-validation.ts';
import { validateCouponCreate, validateCouponUpdate } from '../../src/lib/coupon-admin.ts';
import { validateCreatorProductInput, creatorMediaPrefix, CREATOR_EDITABLE_FIELDS } from '../../src/lib/creator-product-input.ts';

const { buildCheckoutSnapshot, parseCheckoutRequest, couponDiscount, comboAvailability } = contract;
const plain = v => JSON.parse(JSON.stringify(v));
const A = '10000000-0000-4000-8000-0000000000a1', B = '10000000-0000-4000-8000-0000000000b1', C = '10000000-0000-4000-8000-0000000000c1', D = '10000000-0000-4000-8000-0000000000d1';
const makerA = '40000000-0000-4000-8000-0000000000a1', makerB = '40000000-0000-4000-8000-0000000000b1';
const creators = [{ id: makerA, status: 'active', commission_bps: 0 }, { id: makerB, status: 'active', commission_bps: 0 }];
const a = { id: A, name: 'Fictional mug', price: 30000, stock: 5, is_active: true, creator_id: makerA, commerce: { storefronts: ['general'], hsn: '6912', gst_rate_bps: 1200 } };
const b = { id: B, name: 'Fictional pouch', price: 10000, stock: 3, is_active: true, creator_id: makerB, commerce: { storefronts: ['general'], hsn: '4202', gst_rate_bps: 500 } };
const combo = { id: C, name: 'Fictional gift set', price: 45000, stock: 0, is_active: true, creator_id: null, commerce: { storefronts: ['general'], combo: { components: [{ product_id: A, quantity: 1 }, { product_id: B, quantity: 2 }] } } };
const solo = { id: D, name: 'Fictional card', price: 5000, stock: 9, is_active: true, commerce: { storefronts: ['general'], hsn: '4909', gst_rate_bps: 1200 } };
const customer = { customerName: 'Test Buyer', customerEmail: 'b@example.invalid', customerPhone: '9876543210', addressLine1: '1 Fictional St', city: 'Testpur', stateCode: '29', pincode: '560001', acceptTerms: true };
const request = (items, extra = {}) => parseCheckoutRequest({ items, ...customer, ...extra });

// ─── combos ─────────────────────────────────────────────────────────────────
test('combo availability is the minimum of component stock ÷ quantity per combo', () => {
  assert.equal(comboAvailability(combo.commerce.combo.components, new Map([[A, 5], [B, 3]])), 1);
  assert.equal(comboAvailability(combo.commerce.combo.components, new Map([[A, 5], [B, 10]])), 5);
  assert.equal(comboAvailability(combo.commerce.combo.components, new Map([[A, 5]])), 0); // unpublished/missing component
  assert.equal(comboAvailability([], new Map()), 0);
});
test('a combo line records its components, splits its price by component unit prices and counts once for shipping', () => {
  const s = buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }]), [combo, a, b], null, Date.now(), creators, { sellerStateCode: '29', gstRegistered: true });
  assert.deepEqual(s.lines.map(l => [l.combo_role, l.product_id, l.quantity, l.unit_price, l.combo_parent_line ?? null, l.stock_tracked]), [['combo', C, 1, 45000, null, false], ['component', A, 1, 0, 0, true], ['component', B, 2, 0, 0, true]]);
  assert.equal(s.subtotal, 45000); assert.equal(s.shippingCharge, 4900); assert.equal(s.totalAmount, 49900);
  assert.deepEqual(s.lines.map(l => l.taxable_gross ?? null), [0, 27000, 18000]);
  assert.deepEqual(s.taxBreakdown.lines.map(l => [l.gross, l.gst_rate_bps]), [[0, null], [27000, 1200], [18000, 500]]);
  assert.equal(s.taxBreakdown.complete, true);
  assert.equal(s.taxBreakdown.taxable_value + s.taxBreakdown.total_tax, s.totalAmount);
  assert.deepEqual(s.lines.map(l => l.creator_id), [null, makerA, makerB]);
  // Without a pack, standard delivery is charged once per order, however many items.
  assert.equal(buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }, { productId: D, quantity: 1 }]), [combo, a, b, solo], null, Date.now(), creators).shippingCharge, 4900);
  // Discounts reach the combo and therefore its components, never the shipping.
  const coupon = { code: 'TEN', is_active: true, expires_at: null, max_uses: null, times_used: 0, min_order: 0, discount_type: 'percent', discount_value: 10 };
  const d = buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }], { couponCode: 'TEN' }), [combo, a, b], coupon, Date.now(), creators);
  assert.equal(d.discountAmount, 4500); assert.deepEqual(d.lines.map(l => l.taxable_gross ?? null), [0, 24300, 16200]);
});
test('combo stock draws on shared component stock, including direct purchases of the same component', () => {
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 2 }]), [combo, a, b], null, Date.now(), creators), /Not enough stock for Fictional pouch/);
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }, { productId: B, quantity: 2 }]), [combo, a, { ...b, commerce: { ...b.commerce } }], null, Date.now(), creators), /Not enough stock for Fictional pouch/);
  assert.doesNotThrow(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }, { productId: B, quantity: 1 }]), [combo, a, b], null, Date.now(), creators));
});
test('combos fail closed: unpublished/archived/catalog-only/nested/optioned components, combo options and unrated components when GST-registered', () => {
  for (const broken of [{ ...a, is_active: false }, { ...a, commerce: { ...a.commerce, archived: true } }, { ...a, commerce: { ...a.commerce, catalog_only: true } }, { ...a, commerce: { ...a.commerce, combo: { components: [{ product_id: B, quantity: 1 }] } } }, { ...a, commerce: { ...a.commerce, variants: [{ id: 'red', name: 'Red', price: 30000, stock: 5 }] } }])
    assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }]), [combo, broken, b], null, Date.now(), creators), /unavailable pending owner review/);
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }]), [combo, b], null, Date.now(), creators), /unavailable pending owner review/);
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1, personalization: 'Name' }]), [combo, a, b], null, Date.now(), creators), /Options and personalisation/);
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }]), [combo, { ...a, commerce: { storefronts: ['general'] } }, b], null, Date.now(), creators, { sellerStateCode: '29', gstRegistered: true }), /must set its GST rate/);
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: C, quantity: 1 }]), [combo, a, b], null, Date.now(), [creators[0]]), /creator product is temporarily unavailable/);
});
test('owner combo definition is validated: 2–10 distinct components, whole quantities 1–20', () => {
  assert.deepEqual(validateCommerce({ combo: { components: [{ product_id: A, quantity: 1 }, { product_id: B, quantity: 2 }] } }).combo.components.length, 2);
  for (const bad of [{ components: [{ product_id: A, quantity: 1 }] }, { components: [{ product_id: A, quantity: 1 }, { product_id: A, quantity: 1 }] }, { components: [{ product_id: A, quantity: 0 }, { product_id: B, quantity: 1 }] }, { components: [{ product_id: A, quantity: 21 }, { product_id: B, quantity: 1 }] }, { components: [{ product_id: 'x', quantity: 1 }, { product_id: B, quantity: 1 }] }, { components: 'all' }])
    assert.throws(() => validateCommerce({ combo: bad }), /combo|component|Component|product/);
  assert.equal('combo' in validateCommerce({ combo: null }), false);
});

// ─── coupons ────────────────────────────────────────────────────────────────
const coupon = (patch = {}) => ({ code: 'SAVE', is_active: true, expires_at: null, max_uses: null, times_used: 0, min_order: 0, discount_type: 'percent', discount_value: 10, ...patch });
test('coupon rule: percent and flat on merchandise only, minimum order includes the gift card, limits and expiry enforced', () => {
  assert.deepEqual(plain(couponDiscount(coupon(), 25000, 0)), { ok: true, discount: 2500, label: '10% off' });
  assert.equal(couponDiscount(coupon(), 25000, 2000).discount, 2500); // the gift card is never discounted
  assert.equal(couponDiscount(coupon({ discount_type: 'flat', discount_value: 5000 }), 25000, 0).discount, 5000);
  assert.equal(couponDiscount(coupon({ discount_type: 'flat', discount_value: 999999 }), 25000, 0).discount, 25000); // never more than merchandise
  assert.equal(couponDiscount(coupon({ discount_value: 100 }), 25000, 0).discount, 25000);
  assert.equal(couponDiscount(coupon({ min_order: 26000 }), 25000, 2000).ok, true);
  assert.equal(couponDiscount(coupon({ min_order: 26000 }), 25000, 0).reason, 'minimum');
  assert.equal(couponDiscount(coupon({ max_uses: 3, times_used: 3 }), 25000, 0).reason, 'used_up');
  assert.equal(couponDiscount(coupon({ max_uses: 3, times_used: 2 }), 25000, 0).ok, true);
  assert.equal(couponDiscount(coupon({ expires_at: '2026-10-01T00:00:00Z' }), 25000, 0, Date.parse('2026-10-02T00:00:00Z')).reason, 'expired');
  assert.equal(couponDiscount(coupon({ is_active: false }), 25000, 0).reason, 'inactive');
  for (const broken of [{ discount_value: 101 }, { discount_value: -1 }, { discount_type: 'bogo' }, { discount_value: 1.5 }]) assert.equal(couponDiscount(coupon(broken), 25000, 0).reason, 'invalid');
  assert.equal(couponDiscount(null, 25000, 0).reason, 'missing');
});
test('checkout applies exactly the preview discount; coupons never reduce shipping', () => {
  const single = { ...solo, price: 25000 };
  for (const c of [coupon(), coupon({ discount_type: 'flat', discount_value: 30000 }), coupon({ min_order: 20000 })]) {
    const s = buildCheckoutSnapshot(request([{ productId: D, quantity: 1 }], { couponCode: 'SAVE', isGift: true }), [single], c);
    assert.equal(s.discountAmount, couponDiscount(c, s.subtotal, s.giftCharge).discount);
    assert.equal(s.shippingCharge, 4900); assert.ok(s.totalAmount >= s.shippingCharge + s.giftCharge);
  }
  assert.throws(() => buildCheckoutSnapshot(request([{ productId: D, quantity: 1 }], { couponCode: 'SAVE' }), [single], coupon({ max_uses: 1, times_used: 1 })), /coupon is no longer available/);
});
function couponRoute(row) {
  const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/app/api/validate-coupon/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  const q = { select() { return q; }, eq(_c, v) { q.code = v; return q; }, async maybeSingle() { return { data: row && row.code === q.code ? row : null, error: null }; } };
  const deps = { 'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } }, '@/lib/supabase': { supabaseAdmin: { from: () => q } }, '@/lib/commerce-db': { commerceTable: n => `preview_${n}` }, '@/lib/checkout-contract': contract };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => deps[id] }));
  return body => module.exports.POST({ json: async () => body });
}
test('cart preview (/api/validate-coupon) uses the same rule as checkout, including legacy cartTotal callers', async () => {
  const post = couponRoute(coupon({ min_order: 26000 }));
  const ok = await post({ code: ' save ', subtotal: 25000, giftCharge: 2000 });
  assert.deepEqual([ok.body.valid, ok.body.discountAmount], [true, 2500]);
  assert.match((await post({ code: 'SAVE', subtotal: 25000, giftCharge: 0 })).body.message, /Minimum order of ₹260/);
  assert.equal((await post({ code: 'NOPE', subtotal: 25000 })).body.valid, false);
  assert.equal((await post({ code: '', subtotal: 25000 })).status, 400);
  assert.equal((await post({ code: 'SAVE', subtotal: -1 })).status, 400);
  assert.equal((await couponRoute(coupon())({ code: 'SAVE', cartTotal: 25000 })).body.discountAmount, 2500);
});
test('coupon admin accepts only values checkout can honour; date-only expiry lasts through that day in India', () => {
  const created = validateCouponCreate({ code: ' ref-asha ', discount_type: 'flat', discount_value: 5000, min_order: 20000, max_uses: 10, expires_at: '2026-12-31', referrer_code: 'Asha ' });
  assert.deepEqual(created, { code: 'REF-ASHA', discount_type: 'flat', discount_value: 5000, min_order: 20000, max_uses: 10, expires_at: '2026-12-31T18:29:59.999Z', referrer_code: 'asha' });
  assert.equal(validateCouponCreate({ code: 'TEN', discount_type: 'percent', discount_value: 10 }).max_uses, null);
  for (const bad of [{ code: 'x', discount_type: 'percent', discount_value: 10 }, { code: 'BAD CODE', discount_type: 'percent', discount_value: 10 }, { code: 'TEN', discount_type: 'percent', discount_value: 150 }, { code: 'TEN', discount_type: 'percent', discount_value: 0 }, { code: 'TEN', discount_type: 'flat', discount_value: 50 }, { code: 'TEN', discount_type: 'flat', discount_value: 1.5 }, { code: 'TEN', discount_type: 'bogo', discount_value: 10 }, { code: 'TEN', discount_type: 'percent', discount_value: 10, max_uses: 0 }, { code: 'TEN', discount_type: 'percent', discount_value: 10, expires_at: 'soon' }, { code: 'TEN', discount_type: 'percent', discount_value: 10, referrer_code: '<x>' }])
    assert.throws(() => validateCouponCreate(bad), undefined, JSON.stringify(bad));
  assert.deepEqual(validateCouponUpdate({ is_active: false }, 'percent'), { is_active: false });
  assert.throws(() => validateCouponUpdate({ discount_value: 150 }, 'percent'), /percent/);
  assert.deepEqual(validateCouponUpdate({ discount_value: 150 }, 'flat'), { discount_value: 150 });
  assert.throws(() => validateCouponUpdate({}, 'flat'), /Nothing/);
});

// ─── creator self-service input ─────────────────────────────────────────────
const prefix = creatorMediaPrefix('https://project.example.invalid', false);
test('creator input keeps only creator-editable fields; owner-only fields are dropped, media must come from the upload pipeline', () => {
  assert.equal(prefix, 'https://project.example.invalid/storage/v1/object/public/product-images/');
  const input = validateCreatorProductInput({ name: ' Fictional pouch ', description: 'Hand-stitched', short_description: 'Small', materials: 'Cotton', dimensions: '10 cm', preparation_days: '3', proposed_price_rupees: '450.50', media: [{ url: `${prefix}abc.jpg`, type: 'image', alt: 'Pouch' }], price: 1, is_active: true, storefronts: ['christmas'], catalog_only: false, hsn: '1234', gst_rate_bps: 0, commission_bps: 0, combo: {}, stock: 999, creator_id: 'other' }, prefix);
  assert.deepEqual(input, { product_id: null, proposed_price_paise: 45050, fields: { name: 'Fictional pouch', description: 'Hand-stitched', short_description: 'Small', materials: 'Cotton', dimensions: '10 cm', preparation_days: 3, media: [{ url: `${prefix}abc.jpg`, type: 'image', alt: 'Pouch' }] } });
  assert.deepEqual(Object.keys(input.fields).sort(), [...CREATOR_EDITABLE_FIELDS].sort());
  for (const url of ['https://elsewhere.example/abc.jpg', `${prefix}../secret.jpg`, `${prefix}a b.jpg`, 'javascript:alert(1)']) assert.throws(() => validateCreatorProductInput({ name: 'Fine name', media: [{ url, type: 'image' }] }, prefix), /upload button/, url);
  assert.throws(() => validateCreatorProductInput({ name: 'Fine name', media: [{ url: `${prefix}a.exe`, type: 'file' }] }, prefix), /media type/);
  assert.throws(() => validateCreatorProductInput({ description: 'no title' }, prefix), /needs a title/);
  assert.throws(() => validateCreatorProductInput({ name: 'Fine name', proposed_price_rupees: 0.5 }, prefix), /between/);
  assert.throws(() => validateCreatorProductInput({ name: 'Fine name', preparation_days: 400 }, prefix), /Preparation/);
  assert.throws(() => validateCreatorProductInput({ product_id: 'not-a-uuid', name: 'Fine name' }, prefix), /Invalid product/);
  assert.throws(() => validateCreatorProductInput({ name: '<b>x</b>' }, prefix), /unsupported/);
  assert.equal(validateCreatorProductInput({ product_id: A, dimensions: '5 cm' }, prefix).product_id, A);
  assert.throws(() => validateCreatorProductInput({ name: 'Fine name', media: [{ url: `${prefix}a.jpg`, type: 'image' }] }, ''), /upload button/); // no configured bucket: no media accepted
});

// ─── combo storefront rule ──────────────────────────────────────────────────
test('checkout refuses a combo on a storefront where any component is not offered', () => {
  const christmasCombo = { ...combo, commerce: { ...combo.commerce, storefronts: ['general', 'christmas'] } };
  const christmasA = { ...a, commerce: { ...a.commerce, storefronts: ['general', 'christmas'] } };
  const xmas = items => parseCheckoutRequest({ items, storefront: 'christmas', ...customer });
  assert.throws(() => buildCheckoutSnapshot(xmas([{ productId: C, quantity: 1 }]), [christmasCombo, christmasA, b], null, Date.now(), creators), /unavailable pending owner review/);
  const both = { ...b, commerce: { ...b.commerce, storefronts: ['general', 'christmas'] } };
  assert.equal(buildCheckoutSnapshot(xmas([{ productId: C, quantity: 1 }]), [christmasCombo, christmasA, both], null, Date.now(), creators).lines.length, 3);
});
test('saving a combo requires every component to be assigned to each of the combo storefronts', async () => {
  const { createRequire } = await import('node:module');
  const nativeRequire = createRequire(import.meta.url);
  const validation = await import('../../src/lib/product-validation.ts');
  const rows = [{ id: A, name: 'Fictional mug', commerce: { storefronts: ['general', 'christmas'] } }, { id: B, name: 'Fictional pouch', commerce: { storefronts: ['general'] } }];
  let saved = 0;
  const supabaseAdmin = {
    from: () => { const q = { select() { return q; }, async in() { return { data: rows, error: null }; } }; return q; },
    async rpc() { saved++; return { data: { id: 'saved' }, error: null }; },
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/product-admin.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  const deps = { 'server-only': {}, 'node:crypto': nativeRequire('node:crypto'), '@/lib/supabase': { supabaseAdmin }, '@/lib/commerce-db': { commerceTable: n => `preview_${n}` }, '@/lib/product-validation': validation };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => { if (!(id in deps)) throw new Error(`Unexpected ${id}`); return deps[id]; } }));
  const draft = storefronts => ({ name: 'Fictional gift set', price: 450, stock: 0, commerce: { storefronts, combo: { components: [{ product_id: A, quantity: 1 }, { product_id: B, quantity: 2 }] } } });
  await assert.rejects(module.exports.saveOwnerProduct(draft(['general', 'christmas']), 'create'), /Fictional pouch is not assigned to the christmas storefront/);
  assert.equal(saved, 0);
  await module.exports.saveOwnerProduct(draft(['general']), 'create');
  assert.equal(saved, 1);
});
