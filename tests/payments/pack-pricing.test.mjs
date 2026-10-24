import test from 'node:test';
import assert from 'node:assert/strict';
import { packPricing, validPackRule } from '../../src/lib/pack-pricing.ts';
import { buildCheckoutSnapshot, parseCheckoutRequest, shippingChargeFor } from '../../src/lib/checkout-contract.ts';

const rule = { group: 'crochet-clips', size: 4, price: 30000 };
const ids = [1, 2, 3, 4, 5].map(n => `10000000-0000-4000-8000-00000000000${n}`);
const clip = id => ({ id, name: `Clip ${id.slice(-1)}`, price: 10000, stock: 10, is_active: true, commerce: { storefronts: ['general'], pack: rule } });
const other = { id: '10000000-0000-4000-8000-000000000009', name: 'Other item', price: 50000, stock: 10, is_active: true, commerce: { storefronts: ['general'] } };
const address = { customerName: 'Test Buyer', customerEmail: 'b@example.invalid', customerPhone: '9876543210', addressLine1: '1 Fictional Street', city: 'Testpur', stateCode: '29', pincode: '560001', acceptTerms: true };
const snap = (items, products) => buildCheckoutSnapshot(parseCheckoutRequest({ items, storefront: 'general', ...address }), products, null);

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
  assert.equal(shippingChargeFor(1, 'standard', 1), 0); assert.equal(shippingChargeFor(4, 'same_day', 1), 9900);
});
