import test from 'node:test';
import assert from 'node:assert/strict';
import { packPricing, validPackRule } from '../../src/lib/pack-pricing.ts';
import { assertCheckoutReady, buildCheckoutSnapshot, parseAllowedStates, parseCheckoutRequest, servedPinPrefixes, shippingChargeFor } from '../../src/lib/checkout-contract.ts';
import { validateCommerce } from '../../src/lib/product-validation.ts';

const rule = { group: 'crochet-clips', size: 4, price: 30000 };
const ids = [1, 2, 3, 4, 5].map(n => `10000000-0000-4000-8000-00000000000${n}`);
const clip = id => ({ id, name: `Clip ${id.slice(-1)}`, price: 10000, stock: 10, is_active: true, commerce: { storefronts: ['general'], pack: rule } });
const other = { id: '10000000-0000-4000-8000-000000000009', name: 'Other item', price: 50000, stock: 10, is_active: true, commerce: { storefronts: ['general'] } };
const address = { customerName: 'Test Buyer', customerEmail: 'b@example.invalid', customerPhone: '9876543210', addressLine1: '1 Fictional Street', city: 'Testpur', stateCode: '29', pincode: '560001', acceptTerms: true };
const snap = (items, products) => buildCheckoutSnapshot(parseCheckoutRequest({ items, storefront: 'general', ...address }), products, null);

test('checkout rejects a PIN outside the chosen state; served-PIN helper follows the served states', () => {
  const req = over => parseCheckoutRequest({ items: [{ productId: ids[0], quantity: 1 }], storefront: 'general', ...address, ...over });
  assert.throws(() => assertCheckoutReady(req({ pincode: '682001' }), parseAllowedStates('29')), /682001 is not in Karnataka/);
  assert.equal(assertCheckoutReady(req({ pincode: '575001' }), parseAllowedStates('29')).pincode, '575001');
  assert.deepEqual(servedPinPrefixes(parseAllowedStates('29'), null), ['56', '57', '58', '59']);
  assert.equal(servedPinPrefixes(null, null), null);
  assert.deepEqual(servedPinPrefixes(parseAllowedStates('29'), ['560']), ['560']);
});

test('owner product saves keep a valid pack rule and reject a malformed one', () => {
  assert.deepEqual(validateCommerce({ pack: rule }).pack, rule);
  assert.equal(validateCommerce({ pack: null }).pack, undefined);
  assert.throws(() => validateCommerce({ pack: { group: 'Bad Group', size: 4, price: 30000 } }), /pack/i);
});

test('pack rule validation rejects malformed rules', () => {
  assert.deepEqual(validPackRule(rule), rule);
  for (const bad of [null, [], { group: 'X Y', size: 4, price: 30000 }, { group: 'a', size: 1, price: 30000 }, { group: 'a', size: 4, price: 50 }, { group: 'a', size: 4.5, price: 30000 }]) assert.equal(validPackRule(bad), null);
});

test('each full group of 4 is ₹300; leftovers stay ₹100; mixing designs is allowed', () => {
  const lines = n => [{ unitPrice: 10000, quantity: n, pack: rule }];
  assert.deepEqual([1, 3, 4, 5, 8].map(n => packPricing(lines(n)).saving), [0, 0, 10000, 10000, 20000]);
  const mixed = packPricing([{ unitPrice: 10000, quantity: 1, pack: rule }, { unitPrice: 10000, quantity: 2, pack: rule }, { unitPrice: 10000, quantity: 1, pack: rule }]);
  assert.equal(mixed.saving, 10000); assert.equal(mixed.packs, 1);
  assert.equal(packPricing([{ unitPrice: 5000, quantity: 4, pack: rule }]).saving, 0); // never more than buying singly
});

test('checkout totals: 4 clips = ₹300 with free delivery; 5 = ₹400; 1 = ₹100 + ₹49; non-pack items unaffected', () => {
  const four = snap(ids.slice(0, 4).map(productId => ({ productId, quantity: 1 })), ids.map(clip));
  assert.equal(four.subtotal, 40000); assert.equal(four.packSaving, 10000); assert.equal(four.shippingCharge, 0); assert.equal(four.totalAmount, 30000);
  assert.equal(four.lines.reduce((s, l) => s + l.line_discount_amount, 0), 10000);
  const five = snap([{ productId: ids[0], quantity: 3 }, { productId: ids[1], quantity: 2 }], ids.map(clip));
  assert.equal(five.totalAmount, 40000);
  const eight = snap([{ productId: ids[0], quantity: 8 }], ids.map(clip));
  assert.equal(eight.totalAmount, 60000);
  const one = snap([{ productId: ids[0], quantity: 1 }], ids.map(clip));
  assert.equal(one.totalAmount, 10000 + 4900);
  const withOther = snap([{ productId: ids[0], quantity: 4 }, { productId: other.id, quantity: 1 }], [...ids.map(clip), other]);
  assert.equal(withOther.totalAmount, 30000 + 50000);
  // The pack saving is borne only by pack lines, never by another product in the same order.
  assert.equal(withOther.lines.find(l => l.product_id === other.id).line_discount_amount, 0);
  assert.equal(withOther.lines.find(l => l.product_id === ids[0]).line_discount_amount, 10000);
  assert.equal(shippingChargeFor(1, 'standard', 1), 0); assert.equal(shippingChargeFor(4, 'same_day', 1), 9900);
});
