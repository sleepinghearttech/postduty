import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
function load(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => { if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`); return dependencies[id]; }, URL, Date }));
  return module.exports;
}
const helpers = load('src/lib/order-cases.ts');
const orderId = '00000000-0000-4000-8000-000000000001';
const caseId = '00000000-0000-4000-8000-000000000002';
const updated = '2026-10-16T10:00:00.000Z';
const create = { action: 'create', id: caseId, order_id: orderId, kind: 'refund', amount_rupees: 12.34, reason: 'Fictional damaged item', note: 'Fictional test only' };
const transition = { action: 'transition', id: caseId, next_status: 'approved', note: '', external_reference: '', expected_updated_at: updated };
function setup({ owner = true, sameOrigin = true, order = { id: orderId, total_amount: 10000 }, record = { id: caseId, order_id: orderId, status: 'requested', updated_at: updated }, rpcError = null } = {}) {
  const calls = [];
  const database = {
    from(table) {
      calls.push({ type: 'read', table });
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table.endsWith('order_cases') ? record : order, error: null }), order: () => ({ limit: async () => ({ data: record ? [record] : [], error: null }) }) }) }) };
    },
    rpc: async (name, args) => { calls.push({ type: 'rpc', name, args }); return { data: { ...record, status: args.p_command.next_status ?? 'requested' }, error: rpcError }; },
  };
  const route = load('src/app/api/admin/order-cases/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers }) } },
    '@/lib/commerce-auth': { requireOwner: async () => owner, isAllowedMutationOrigin: () => sameOrigin },
    '@/lib/commerce-db': { commerceTable: name => `preview_${name}` },
    '@/lib/supabase': { supabaseAdmin: database }, '@/lib/order-cases': helpers,
  });
  const request = body => ({ text: async () => typeof body === 'string' ? body : JSON.stringify(body), nextUrl: new URL(`https://preview.example/api/admin/order-cases?order_id=${orderId}`) });
  return { route, calls, request };
}

test('requested rupees convert exactly to paise; invalid, overprecise or negative amounts fail', () => {
  assert.equal(helpers.parseOrderCaseCommand(create).requested_amount_paise, 1234);
  for (const value of [-1, NaN, Infinity, 1.234, '12.34', 21474836.48]) assert.throws(() => helpers.parseOrderCaseCommand({ ...create, amount_rupees: value }), /amount/i);
  assert.throws(() => helpers.parseOrderCaseCommand({ ...create, amount_rupees: 0 }), /greater than zero/);
  assert.equal(helpers.parseOrderCaseCommand({ ...create, kind: 'cancellation', amount_rupees: 0 }).requested_amount_paise, 0);
});
test('request amount is capped to the full canonical order total', () => {
  helpers.assertCaseAmount({ requested_amount_paise: 10000 }, 10000);
  assert.throws(() => helpers.assertCaseAmount({ requested_amount_paise: 10001 }, 10000), /exceed/);
});
test('status graph prevents skipping owner review, reversing decisions or reopening resolved cases', () => {
  const allowed = { requested: ['approved', 'rejected'], approved: ['resolved'], rejected: ['resolved'], resolved: [] };
  for (const current of Object.keys(allowed)) for (const next of ['approved', 'rejected', 'resolved']) {
    const run = () => helpers.assertCaseTransition({ status: current, updated_at: updated }, { ...transition, next_status: next });
    if (allowed[current].includes(next)) assert.doesNotThrow(run); else assert.throws(run, /transition/);
  }
});
test('external evidence is mandatory for resolution and rejection requires a decision reason', () => {
  assert.throws(() => helpers.parseOrderCaseCommand({ ...transition, next_status: 'resolved' }), /External resolution reference/);
  assert.throws(() => helpers.parseOrderCaseCommand({ ...transition, next_status: 'rejected' }), /Decision note/);
  assert.equal(helpers.parseOrderCaseCommand({ ...transition, next_status: 'resolved', external_reference: ' Fictional provider receipt ' }).external_reference, 'Fictional provider receipt');
});
test('stale case version is rejected before a decision', () => {
  assert.throws(() => helpers.assertCaseTransition({ status: 'requested', updated_at: '2026-10-16T11:00:00.000Z' }, transition), /changed/);
});
test('owner authorization protects GET and POST independently before any database access', async () => {
  const { route, request, calls } = setup({ owner: false });
  assert.equal((await route.GET(request(create))).status, 401);
  assert.equal((await route.POST(request(create))).status, 401);
  assert.deepEqual(calls, []);
});
test('cross-origin owner mutations are rejected without touching records', async () => {
  const { route, request, calls } = setup({ sameOrigin: false });
  assert.equal((await route.POST(request(create))).status, 403);
  assert.deepEqual(calls, []);
});
test('oversized/malformed payloads and excessive amounts cannot reach the atomic write', async () => {
  const { route, request, calls } = setup();
  assert.equal((await route.POST(request('x'.repeat(16001)))).status, 413);
  assert.equal((await route.POST(request('{bad'))).status, 400);
  assert.equal((await route.POST(request({ ...create, amount_rupees: 100.01 }))).status, 400);
  assert.equal(calls.filter(call => call.type === 'rpc').length, 0);
});
test('valid request invokes only sandbox ledger RPC and returns no-money-movement label', async () => {
  const { route, request, calls } = setup();
  const result = await route.POST(request(create));
  assert.equal(result.status, 200); assert.equal(result.body.manual_record_only, true);
  assert.match(result.body.message, /No funds moved/);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  const writes = calls.filter(call => call.type === 'rpc');
  assert.equal(writes.length, 1); assert.equal(writes[0].name, 'preview_save_order_case');
  assert.equal(writes[0].args.p_command.requested_amount_paise, 1234);
});
test('missing orders and stale states never reach persistence', async () => {
  const missing = setup({ order: null });
  assert.equal((await missing.route.POST(missing.request(create))).status, 404);
  assert.equal(missing.calls.filter(call => call.type === 'rpc').length, 0);
  const stale = setup({ record: { status: 'requested', updated_at: '2026-10-16T12:00:00.000Z' } });
  assert.equal((await stale.route.POST(stale.request(transition))).status, 409);
  assert.equal(stale.calls.filter(call => call.type === 'rpc').length, 0);
});
test('atomic database conflicts are sanitized as actionable refresh responses', async () => {
  const { route, request } = setup({ rpcError: { message: 'case_conflict PRIVATE_INTERNAL_CONTEXT' } });
  const result = await route.POST(request(transition));
  assert.equal(result.status, 409); assert.doesNotMatch(result.body.error, /PRIVATE/);
});
test('SQL restricts ledger to service role and couples audit with record changes without order/payment/stock writes', () => {
  const sql = readFileSync(new URL('supabase/commerce/order-cases.preview.sql', root), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.preview_order_cases FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.preview_save_order_case\(jsonb\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.preview_save_order_case\(jsonb\) TO service_role/);
  assert.match(sql, /FOR UPDATE/); assert.match(sql, /ON CONFLICT\(id\) DO NOTHING/);
  assert.match(sql, /INSERT INTO public\.preview_audit_events/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\.preview_(?:orders|order_items|products|payment\w*)\b/i);
  assert.match(sql, /saved\.updated_at IS DISTINCT FROM/);
});
