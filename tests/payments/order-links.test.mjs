import test from 'node:test';
import assert from 'node:assert/strict';
import { myOrdersUrl, orderStatusUrl, ordersToken, verifyOrdersToken } from '../../src/lib/order-links.ts';

const env = { ORDER_LINKS_SECRET: 'fictional-test-secret-0123456789' };

test('my-orders links are signed per email, case-insensitive, and reject tampering', () => {
  const token = ordersToken('Buyer@Example.invalid', env);
  assert.ok(token && token.length > 20);
  assert.equal(token, ordersToken('buyer@example.invalid', env));
  assert.equal(verifyOrdersToken('buyer@example.invalid', token, env), true);
  assert.equal(verifyOrdersToken('other@example.invalid', token, env), false);
  assert.equal(verifyOrdersToken('buyer@example.invalid', token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), env), false);
  assert.equal(verifyOrdersToken('buyer@example.invalid', '', env), false);
  assert.equal(verifyOrdersToken('buyer@example.invalid', token, { ORDER_LINKS_SECRET: 'a-different-secret-9876543210' }), false);
});

test('no secret configured means no link and nothing verifies', () => {
  assert.equal(ordersToken('buyer@example.invalid', {}), null);
  assert.equal(myOrdersUrl('buyer@example.invalid', {}), null);
  assert.equal(verifyOrdersToken('buyer@example.invalid', 'x', {}), false);
});

test('urls point at the approved store domain', () => {
  assert.match(myOrdersUrl('Buyer@Example.invalid', env), /^https:\/\/store\.postduty\.in\/my-orders\?e=buyer%40example\.invalid&t=/);
  assert.equal(orderStatusUrl('abc'), 'https://store.postduty.in/order/abc');
  assert.equal(orderStatusUrl('abc', 'christmas'), 'https://store.postduty.in/order/abc?storefront=christmas');
});
