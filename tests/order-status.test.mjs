import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as status from '../src/lib/order-status.ts';
import * as payouts from '../src/lib/creator-payouts.ts';

const nativeRequire = createRequire(import.meta.url);
function load(path, deps, env = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => { if (id in deps) return deps[id]; if (id.startsWith('react')) return nativeRequire(id); throw new Error(`Unexpected dependency ${id}`); }, process: { env }, URL, Date, Headers }));
  return module.exports;
}
const orderId = '30000000-0000-4000-8000-000000000001';
// Values created inside the vm context have foreign prototypes; compare plain data.
const plain = value => JSON.parse(JSON.stringify(value));

test('status transitions: paid→shipped/cancelled/refunded, shipped→delivered/refunded, delivered→refunded; terminal states stay terminal', () => {
  const allowed = { pending: [], paid: ['shipped', 'cancelled', 'refunded'], shipped: ['delivered', 'refunded'], delivered: ['refunded'], cancelled: [], refunded: [] };
  for (const from of Object.keys(allowed)) for (const to of Object.keys(allowed)) assert.equal(status.canTransition(from, to), allowed[from].includes(to), `${from}→${to}`);
  assert.equal(status.canTransition('paid', 'paid'), false);
  assert.equal(status.canTransition('unknown', 'paid'), false);
  assert.throws(() => status.planOrderUpdate({ status: 'shipped', tracking_number: 'AWB1' }, { status: 'cancelled' }), /Invalid status transition: shipped → cancelled/);
  assert.throws(() => status.planOrderUpdate({ status: 'pending', tracking_number: null }, { status: 'paid' }), /Invalid status transition/);
  assert.throws(() => status.planOrderUpdate({ status: 'paid', tracking_number: null }, { status: 'lost' }), /Unknown order status/);
  assert.deepEqual(status.planOrderUpdate({ status: 'paid', tracking_number: null }, { status: 'cancelled' }), { kind: 'cancel' });
  const refund = status.planOrderUpdate({ status: 'delivered', tracking_number: 'AWB1' }, { status: 'refunded' }, new Date('2026-10-17T00:00:00Z'));
  assert.deepEqual(refund, { kind: 'update', updates: { status: 'refunded', refunded_at: '2026-10-17T00:00:00.000Z' }, firstTracking: false, notifyShipped: false });
  assert.throws(() => status.planOrderUpdate({ status: 'paid', tracking_number: null }, { tracking_number: 'AWB1' }), /once the order is shipped/);
  assert.throws(() => status.planOrderUpdate({ status: 'cancelled', tracking_number: null }, { tracking_number: 'AWB1' }), /once the order is shipped/);
  for (const tracking_number of ['', '   ', 'x'.repeat(101), '<script>', 42]) assert.throws(() => status.planOrderUpdate({ status: 'shipped', tracking_number: null }, { tracking_number }), /tracking number/);
});
test('shipped notification is planned once: never on mark-shipped, only when tracking is first saved', () => {
  const ship = status.planOrderUpdate({ status: 'paid', tracking_number: null }, { status: 'shipped' });
  assert.equal(ship.notifyShipped, false);
  const first = status.planOrderUpdate({ status: 'shipped', tracking_number: null }, { tracking_number: ' AWB123 ' });
  assert.deepEqual(first, { kind: 'update', updates: { tracking_number: 'AWB123' }, firstTracking: true, notifyShipped: true });
  assert.equal(status.planOrderUpdate({ status: 'shipped', tracking_number: '' }, { tracking_number: 'AWB123' }).notifyShipped, true);
  assert.equal(status.planOrderUpdate({ status: 'shipped', tracking_number: 'AWB123' }, { tracking_number: 'AWB999' }).notifyShipped, false);
  assert.throws(() => status.planOrderUpdate({ status: 'shipped', tracking_number: 'AWB123' }, { tracking_number: 'AWB123' }), /Nothing to update/);
  assert.equal(status.planOrderUpdate({ status: 'delivered', tracking_number: null }, { tracking_number: 'AWB1' }).notifyShipped, false);
  assert.equal(status.planOrderUpdate({ status: 'paid', tracking_number: null }, { status: 'shipped', tracking_number: 'AWB1' }).notifyShipped, true);
});

function routeSetup({ owner = true, order = { id: orderId, status: 'paid', tracking_number: null, is_test: false }, rpcResult = { id: orderId, status: 'cancelled' }, rpcError = null, updateRow = undefined } = {}) {
  const calls = []; let notifications = 0;
  const builder = (table) => {
    const state = { table, filters: [], updates: null };
    const q = {
      select() { return q; }, eq(column, value) { state.filters.push(['eq', column, value]); return q; }, or(expr) { state.filters.push(['or', expr]); return q; },
      update(values) { state.updates = values; calls.push({ type: 'update', state }); return q; },
      async single() { return { data: order, error: order ? null : { message: 'missing' } }; },
      async maybeSingle() { return { data: updateRow === undefined ? { ...order, ...state.updates } : updateRow, error: null }; },
    };
    return q;
  };
  const supabaseAdmin = { from: builder, rpc: async (name, args) => { calls.push({ type: 'rpc', name, args }); return { data: rpcError ? null : rpcResult, error: rpcError }; } };
  const send = async () => { notifications++; };
  const route = load('../src/app/api/admin/update-order/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/commerce-auth': { requireOwner: async () => owner, isAllowedMutationOrigin: () => true },
    '@/lib/commerce-db': { commerceTable: name => `preview_${name}` },
    '@/lib/supabase': { supabaseAdmin }, '@/lib/order-status': status,
    '@/lib/notifications': { sendCustomerShippedWhatsApp: send, sendAdminShippedWhatsApp: send }, '@/lib/email': { sendCustomerShippingEmail: send }, '@/lib/creator-payouts': payouts,
  });
  const request = body => ({ text: async () => JSON.stringify(body) });
  return { route, calls, request, get notifications() { return notifications; } };
}
test('update-order route: mark shipped sends nothing; first tracking save sends once with a guarded conditional update', async () => {
  const shipped = routeSetup();
  const r1 = await shipped.route.POST(shipped.request({ id: orderId, status: 'shipped' }));
  assert.equal(r1.status, 200); assert.equal(shipped.notifications, 0);
  assert.deepEqual(shipped.calls[0].state.filters, [['eq', 'id', orderId], ['eq', 'status', 'paid']]);
  const tracking = routeSetup({ order: { id: orderId, status: 'shipped', tracking_number: null } });
  assert.equal((await tracking.route.POST(tracking.request({ id: orderId, tracking_number: 'AWB1' }))).status, 200);
  assert.equal(tracking.notifications, 3); // customer WhatsApp + owner WhatsApp + customer email, once
  assert.deepEqual(tracking.calls[0].state.filters.at(-1), ['or', 'tracking_number.is.null,tracking_number.eq.']);
  const correction = routeSetup({ order: { id: orderId, status: 'shipped', tracking_number: 'AWB1' } });
  assert.equal((await correction.route.POST(correction.request({ id: orderId, tracking_number: 'AWB2' }))).status, 200);
  assert.equal(correction.notifications, 0);
  const raced = routeSetup({ order: { id: orderId, status: 'shipped', tracking_number: null }, updateRow: null });
  assert.equal((await raced.route.POST(raced.request({ id: orderId, tracking_number: 'AWB1' }))).status, 409);
  assert.equal(raced.notifications, 0);
});
test('update-order route: cancel uses the transactional stock-restoring function; invalid transitions and outsiders are refused', async () => {
  const cancel = routeSetup();
  const result = await cancel.route.POST(cancel.request({ id: orderId, status: 'cancelled' }));
  assert.equal(result.status, 200); assert.equal(result.body.order.status, 'cancelled');
  assert.deepEqual(plain(cancel.calls), [{ type: 'rpc', name: 'preview_cancel_paid_order', args: { p_order_id: orderId } }]);
  const stale = routeSetup({ rpcError: { message: 'invalid_status_transition' } });
  assert.equal((await stale.route.POST(stale.request({ id: orderId, status: 'cancelled' }))).status, 409);
  const shipped = routeSetup({ order: { id: orderId, status: 'shipped', tracking_number: 'AWB1' } });
  const bad = await shipped.route.POST(shipped.request({ id: orderId, status: 'cancelled' }));
  assert.equal(bad.status, 400); assert.equal(shipped.calls.length, 0);
  const outsider = routeSetup({ owner: false });
  assert.equal((await outsider.route.POST(outsider.request({ id: orderId, status: 'cancelled' }))).status, 401);
  assert.equal(outsider.calls.length, 0);
  const malformed = routeSetup();
  assert.equal((await malformed.route.POST(malformed.request({ id: 'not-a-uuid', status: 'shipped' }))).status, 400);
});
test('owner line descriptions show variant and personalisation text', () => {
  assert.equal(status.describeOrderLine({ product_name: 'Fictional mug', quantity: 2, variant_id: 'red', variant_name: 'Red', personalization: { text: 'Dr. Test' } }), 'Fictional mug (Red) × 2 — Personalisation: Dr. Test');
  assert.equal(status.describeOrderLine({ products: { name: 'Legacy item' }, quantity: 1, personalization: {} }), 'Legacy item × 1');
  assert.equal(status.describeOrderLine({ product_name: 'Fictional mug', quantity: 1, variant_id: 'blue' }), 'Fictional mug (blue) × 1');
});

function slipSetup({ owner = true, order = { id: orderId, created_at: '2026-10-17T00:00:00Z', status: 'paid', customer_name: 'Fictional Buyer', customer_phone: '9000000000', shipping_address: 'Fictional legacy address', is_gift: true, gift_message: 'Fictional wishes', shipping_details: { name: 'Fictional Buyer', phone: '9000000000', address_line1: '1 Fictional Street', address_line2: null, city: 'Testpur', state: 'Karnataka', pincode: '560001' } } } = {}) {
  const reads = [];
  const supabaseAdmin = { from(table) { reads.push(table); const q = { select() { return q; }, eq() { return table.endsWith('order_items') ? Promise.resolve({ data: [{ quantity: 1, product_name: 'Fictional mug', variant_id: 'red', variant_name: 'Red', personalization: { text: 'Dr. Test' } }], error: null }) : q; }, maybeSingle: async () => ({ data: order, error: null }) }; return q; } };
  const navigation = { redirect: url => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } };
  const helpers = load('../src/lib/packing-slip.ts', { './order-status': status });
  const page = load('../src/app/admin/orders/[id]/packing-slip/page.tsx', {
    'next/link': { default: () => null }, 'next/navigation': navigation,
    '@/lib/commerce-auth': { requireOwner: async () => owner }, '@/lib/commerce-db': { commerceTable: name => `preview_${name}` },
    '@/lib/supabase': { supabaseAdmin }, '@/lib/business/queries': { missingColumn: () => false }, '@/lib/packing-slip': helpers, './PrintButton': { default: () => null }, '@/lib/creator-pickups': { loadCreatorPickups: async ids => { reads.push('pickups'); return ids.filter(Boolean).length ? [{ creator_id: 'c1', pickup_name: 'Fictional Maker', phone: '9000000000', address: 'Fictional workshop', pincode: '560001', shiprocket_location: null }] : []; } },
  });
  return { page: page.default, reads, helpers };
}
test('packing slip: owner-only (redirects before any order read), valid IDs only, and it never exposes prices or email', async () => {
  const outsider = slipSetup({ owner: false });
  await assert.rejects(outsider.page({ params: Promise.resolve({ id: orderId }) }), error => error.url === '/admin/login');
  assert.deepEqual(outsider.reads, []);
  const owner = slipSetup();
  await assert.rejects(owner.page({ params: Promise.resolve({ id: '../../etc' }) }), /NEXT_NOT_FOUND/);
  const element = await owner.page({ params: Promise.resolve({ id: orderId }) });
  assert.ok(element); assert.deepEqual(owner.reads, ['preview_orders', 'preview_order_items', 'pickups']);
  const slip = plain(owner.helpers.packingSlipView({ id: orderId, created_at: '2026-10-17T00:00:00Z', status: 'paid', customer_name: 'Fictional Buyer', customer_phone: '9000000000', shipping_address: 'Line one\nLine two', is_gift: false, gift_message: 'hidden' }, [{ quantity: 2, products: { name: 'Legacy item' }, personalization: { text: 'Name' } }]));
  assert.deepEqual(slip.addressLines, ['Line one', 'Line two']); assert.equal(slip.giftMessage, null); assert.equal(slip.totalUnits, 2);
  assert.deepEqual(slip.items, [{ name: 'Legacy item', option: null, quantity: 2, personalization: 'Name' }]);
  assert.equal(JSON.stringify(slip).includes('total_amount'), false);
});
test('middleware keeps /admin packing slips behind the owner session', async () => {
  const reply = (s, headers = {}) => ({ status: s, headers: new Headers(headers) });
  const { middleware } = load('../src/middleware.ts', { 'next/server': { NextResponse: { next: () => reply(200), json: (b, i = {}) => reply(i.status ?? 200), redirect: url => reply(307, { Location: String(url) }) } } }, { ADMIN_SECRET: 'fictional-owner-password' });
  const request = cookies => { const url = new URL(`https://postduty.example/admin/orders/${orderId}/packing-slip`); url.clone = () => new URL(url); return { url: String(url), nextUrl: url, headers: new Headers({ host: url.host }), cookies: { get: name => cookies[name] ? { value: cookies[name] } : undefined } }; };
  const denied = await middleware(request({ admin_session: 'forged' }));
  assert.equal(denied.status, 307); assert.equal(new URL(denied.headers.get('location')).pathname, '/admin/login');
  assert.equal((await middleware(request({ admin_session: 'fictional-owner-password' }))).status, 200);
});
