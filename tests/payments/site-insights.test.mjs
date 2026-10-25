import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceClass, isBot, parseSiteEvent, referrerHost, safePath, sanitizeAttribution, sourceFor, placeFrom } from '../../src/lib/site-insights.ts';
import { summarizeAudience, istHour } from '../../src/lib/business/audience.ts';
import { pinArea } from '../../src/lib/bengaluru-pins.ts';

test('paths drop query strings and fragments so tokens are never stored', () => {
  assert.equal(safePath('/my-orders?e=a@b.c&t=secret'), '/my-orders');
  assert.equal(safePath('/creator#invite=abc'), '/creator');
  assert.equal(safePath('https://evil.example/x'), null);
  assert.equal(safePath('//evil.example'), null);
});

test('referrers resolve to known source families and ignore our own domains', () => {
  assert.equal(referrerHost('https://l.instagram.com/?u=x'), 'l.instagram.com');
  assert.equal(referrerHost('https://store.postduty.in/store'), null);
  assert.equal(referrerHost('javascript:alert(1)'), null);
  assert.equal(sourceFor(null, 'l.instagram.com'), 'instagram');
  assert.equal(sourceFor(null, 'google.co.in'), 'google');
  assert.equal(sourceFor(null, null), 'direct');
  assert.equal(sourceFor('whatsapp', 'google.com'), 'whatsapp');
});

test('attribution is normalised and bounded', () => {
  const a = sanitizeAttribution({ source: 'Instagram Reel!', medium: 'Story', campaign: 'x'.repeat(200), referrer_host: 'www.facebook.com', landing_path: '/products/a?b=c', first_seen_at: 'nonsense' });
  assert.equal(a.source, 'instagram_reel_');
  assert.equal(a.medium, 'story');
  assert.equal(a.campaign.length, 80);
  assert.equal(a.referrer_host, 'facebook.com');
  assert.equal(a.landing_path, '/products/a');
  assert.equal(a.first_seen_at, null);
  assert.equal(sanitizeAttribution(null), null);
  assert.equal(sanitizeAttribution({}).source, 'direct');
});

test('events are allow-listed and malformed input is rejected', () => {
  assert.equal(parseSiteEvent({ event: 'delete_all', session_id: 'abcdefgh12', path: '/' }), null);
  assert.equal(parseSiteEvent({ event: 'page_view', session_id: 'x', path: '/' }), null);
  assert.equal(parseSiteEvent({ event: 'page_view', session_id: 'abcdefgh12', path: 'nope' }), null);
  const e = parseSiteEvent({ event: 'add_to_cart', session_id: 'abcdefgh12', path: '/store?x=1', product_id: 'E6A8FEE7-7FC4-4134-877F-95BE8609A2F5', storefront: 'christmas', attribution: { source: 'whatsapp' } });
  assert.deepEqual([e.event, e.path, e.storefront, e.product_id, e.source], ['add_to_cart', '/store', 'christmas', 'e6a8fee7-7fc4-4134-877f-95be8609a2f5', 'whatsapp']);
});

test('device, bot and place helpers', () => {
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'), 'mobile');
  assert.equal(deviceClass('Mozilla/5.0 (iPad; CPU OS 17)'), 'tablet');
  assert.equal(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64)'), 'desktop');
  assert.equal(isBot('Googlebot/2.1'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot('Mozilla/5.0 (iPhone)'), false);
  assert.deepEqual(placeFrom({ country: 'IN', region: 'Karnataka', city: 'Bengaluru' }), { country: 'IN', region: 'Karnataka', city: 'Bengaluru' });
  assert.equal(placeFrom(undefined, 'XX').country, null);
});

test('PIN codes map to Bengaluru areas', () => {
  assert.equal(pinArea('560034').area, 'Koramangala');
  assert.equal(pinArea('560999').area, 'Bengaluru (other)');
  assert.equal(pinArea('682001').area, 'Outside Bengaluru');
  assert.equal(pinArea('abc'), null);
});

test('audience summary builds funnel, hours (IST), sources and areas', () => {
  const ev = (event, session_id, created_at, extra = {}) => ({ event, session_id, created_at, path: '/store', source: 'direct', device: 'mobile', city: 'Bengaluru', region: 'Karnataka', landing_path: '/store', ...extra });
  const events = [
    ev('page_view', 's1aaaaaa', '2026-10-25T14:00:00Z', { source: 'instagram' }),
    ev('product_view', 's1aaaaaa', '2026-10-25T14:01:00Z', { path: '/products/red-hearts' }),
    ev('add_to_cart', 's1aaaaaa', '2026-10-25T14:02:00Z'),
    ev('checkout_start', 's1aaaaaa', '2026-10-25T14:03:00Z'),
    ev('page_view', 's2bbbbbb', '2026-10-25T03:00:00Z'),
  ];
  const orders = [{ id: 'o1', created_at: '2026-10-25T14:05:00Z', total_amount: 30000, pincode: '560034', attribution: { source: 'instagram', device: 'mobile', session_id: 's1aaaaaa' } },
    { id: 'o0', created_at: '2026-10-20T14:30:00Z', total_amount: 14900, pincode: '682001', attribution: null }];
  const s = summarizeAudience(events, orders);
  // The untracked older order counts in totals but not in the visit funnel.
  assert.deepEqual(s.funnel, { visits: 2, productViews: 1, addToCart: 1, checkoutStarts: 1, paidOrders: 1, allPaidOrders: 2 });
  assert.equal(s.conversion.visitToPaid, 50);
  assert.equal(istHour('2026-10-25T14:05:00Z'), 19);
  assert.equal(s.hours[19].orders, 1);
  assert.equal(s.busiestOrderHour.label, '7pm');
  assert.deepEqual(s.orderSources[0], { label: 'instagram', count: 1, amount: 30000 });
  assert.equal(s.orderAreas[0].label, 'Koramangala · 560034');
  assert.equal(s.visitSources.find(r => r.label === 'instagram').count, 1);
  assert.equal(s.productPages[0].label, 'red-hearts');
});
