import test from 'node:test';
import assert from 'node:assert/strict';
import { creatorOrderEmail } from '../../src/lib/email.ts';

const raj = { id: '10000000-0000-4000-8000-00000000000a', email: 'maker@example.invalid', display_name: 'Rajeshwari' };
const other = '10000000-0000-4000-8000-00000000000b';
const order = { id: '20000000-0000-4000-8000-000000000001', shipping_details: { delivery_method: 'same_day' } };
const studio = 'https://store.postduty.in/creator';

test('creator email lists only that creator\'s lines and flags same-day delivery', () => {
  const mail = creatorOrderEmail(order, [
    { creator_id: raj.id, product_name: 'Clip — Mustard', quantity: 2, personalization: { text: 'Dr. R' } },
    { creator_id: other, product_name: 'Someone else', quantity: 1 },
  ], raj, studio);
  assert.match(mail.subject, /^SAME-DAY · New PostDuty order: 2 pieces to make$/);
  assert.match(mail.html, /Clip — Mustard × 2/);
  assert.match(mail.html, /Personalisation: Dr\. R/);
  assert.doesNotMatch(mail.html, /Someone else/);
  assert.match(mail.html, /store\.postduty\.in\/creator/);
});

test('customer-entered text is escaped and a creator with no lines gets no email', () => {
  const mail = creatorOrderEmail({ ...order, shipping_details: null }, [{ creator_id: raj.id, product_name: 'Clip', quantity: 1, personalization: { text: '<script>x</script>' } }], raj, studio);
  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.subject, /^New PostDuty order: 1 piece to make$/);
  assert.equal(creatorOrderEmail(order, [{ creator_id: other, product_name: 'X', quantity: 1 }], raj, studio), null);
});

test('creator email carries delivery contact, address, map link and customer prices, all escaped', () => {
  const full = { id: '20000000-0000-4000-8000-000000000002', customer_name: 'Asha <b>K</b>', customer_phone: '+91 90000 00000', total_amount: 14900, shipping_amount: 4900, is_gift: true, gift_message: 'Happy <3 day',
    shipping_details: { delivery_method: 'standard', address_line1: '12 Fictional Road', address_line2: 'Near "Park"', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' } };
  const mail = creatorOrderEmail(full, [{ creator_id: raj.id, product_name: 'Clip', quantity: 1, unit_price: 10000 }], raj, studio);
  assert.match(mail.html, /customer pays ₹100/);
  assert.match(mail.html, /Whole order paid by the customer: <strong>₹149<\/strong> \(includes ₹49 delivery\)/);
  assert.match(mail.html, /Asha &lt;b&gt;K&lt;\/b&gt;/);
  assert.match(mail.html, /href="tel:\+919000000000"/);
  assert.match(mail.html, /12 Fictional Road/);
  assert.match(mail.html, /Near &quot;Park&quot;/);
  assert.match(mail.html, /560034/);
  assert.match(mail.html, /google\.com\/maps\/search\/\?api=1&amp;query=12%20Fictional%20Road/);
  assert.match(mail.html, /Happy &lt;3 day/);
  assert.match(mail.html, /do not collect money/);
  const pack = creatorOrderEmail(full, [{ creator_id: raj.id, product_name: 'Clip', quantity: 4, unit_price: 10000, line_discount_amount: 10000 }], raj, studio);
  assert.match(pack.html, /customer pays ₹300 \(₹100 each, after pack\/discount\)/);
});