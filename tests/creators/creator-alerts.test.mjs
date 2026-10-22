import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreatorWhatsApp, creatorAlerts } from '../../src/lib/notifications.ts';

const a = '10000000-0000-4000-8000-00000000000a';
const b = '10000000-0000-4000-8000-00000000000b';
const order = { id: '20000000-0000-4000-8000-000000000001', customer_name: 'Test Buyer', shipping_details: { delivery_method: 'same_day' } };

test('creator numbers come only from a well-formed JSON secret; bad entries and bad JSON are ignored', () => {
  assert.equal(parseCreatorWhatsApp(undefined).size, 0);
  assert.equal(parseCreatorWhatsApp('not json').size, 0);
  assert.equal(parseCreatorWhatsApp('["+91 90000 00000"]').size, 0);
  const numbers = parseCreatorWhatsApp(JSON.stringify({ [a.toUpperCase()]: '+91 90000 00001', 'not-a-uuid': '+91 90000 00002', [b]: 12345 }));
  assert.deepEqual([...numbers.entries()], [[a, '+91 90000 00001']]);
});

test('each configured creator gets one alert listing only their own lines; others and unassigned lines are skipped', () => {
  const lines = [
    { creator_id: a, product_name: 'Clip — Mustard', quantity: 2, variant_name: null, personalization: { text: 'Dr. R' } },
    { creator_id: a, product_name: 'Clip — Lavender', quantity: 1 },
    { creator_id: b, product_name: 'Other maker item', quantity: 1 },
    { creator_id: null, product_name: 'PostDuty item', quantity: 1 },
  ];
  const alerts = creatorAlerts(order, lines, new Map([[a, '+91 90000 00001']]), 'https://store.postduty.in/creator');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].phone, '+91 90000 00001');
  assert.match(alerts[0].details, /Clip — Mustard × 2 \[Personalisation: Dr\. R\]; Clip — Lavender × 1/);
  assert.match(alerts[0].details, /SAME-DAY delivery/);
  assert.doesNotMatch(alerts[0].details, /Other maker item|PostDuty item/);
  assert.match(alerts[0].body, /store\.postduty\.in\/creator/);
  assert.ok(alerts[0].details.length <= 900);
});

test('standard delivery is labelled and no numbers means no alerts', () => {
  const standard = creatorAlerts({ ...order, shipping_details: null }, [{ creator_id: a, product_name: 'Clip', quantity: 1 }], new Map([[a, '+91 90000 00001']]), 'https://store.postduty.in/creator');
  assert.match(standard[0].details, /Standard delivery/);
  assert.equal(creatorAlerts(order, [{ creator_id: a, product_name: 'Clip', quantity: 1 }], new Map(), 'x').length, 0);
});
