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
