import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const creatorId = '40000000-0000-4000-8000-0000000000e1';
const itemId = '50000000-0000-4000-8000-0000000000e1';
const orderId = '30000000-0000-4000-8000-0000000000e1';
function setup(item) {
  const updates = [];
  const supabaseAdmin = {
    from(table) {
      const state = { table, filters: [], update: null };
      const q = {
        select() { return q; }, eq(c, v) { state.filters.push(['eq', c, v]); return q; }, is(c, v) { state.filters.push(['is', c, v]); return q; },
        update(values) { state.update = values; updates.push(state); return q; },
        async maybeSingle() {
          if (state.update) return { data: { id: itemId }, error: null };
          if (table.endsWith('creators')) return { data: { id: creatorId }, error: null };
          if (table.endsWith('order_items')) return { data: item, error: null };
          return { data: { id: orderId, status: 'paid', razorpay_payment_id: 'pay_fixture' }, error: null };
        },
      };
      return q;
    },
  };
  const deps = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/commerce-auth': { requireOwner: async () => true, isAllowedMutationOrigin: () => true },
    '@/lib/supabase': { supabaseAdmin }, '@/lib/commerce-db': { commerceTable: n => `preview_${n}`, isCommerceSandbox: () => true },
    '@/lib/creator-data': { creatorFulfillment: async () => [] },
    '@/lib/creator-auth': { creatorAudit: async () => {}, plainText: v => String(v ?? ''), uuid: v => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) },
    '@/lib/creator-profile': {}, '@/lib/creator-payouts': {}, '@/lib/creator-statement': {},
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/app/api/admin/creators/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => { if (!(id in deps)) throw new Error(`Unexpected ${id}`); return deps[id]; }, process: { env: {} }, crypto, Headers, URL }));
  const request = body => ({ headers: new Headers({ 'content-length': '100' }), json: async () => body });
  return { POST: module.exports.POST, request, updates };
}
const base = { id: itemId, order_id: orderId, creator_id: null, fulfillment_status: 'awaiting_acceptance', settlement_id: null };

test('a line already in a creator settlement cannot be reassigned (409, nothing written)', async () => {
  const s = setup({ ...base, creator_id: '40000000-0000-4000-8000-0000000000e2', settlement_id: '60000000-0000-4000-8000-0000000000e1' });
  const result = await s.POST(s.request({ action: 'assign', order_item_id: itemId, creator_id: creatorId }));
  assert.equal(result.status, 409); assert.match(result.body.error, /settlement/);
  assert.equal(s.updates.length, 0);
});
test('reassignment of an unsettled line is guarded by settlement_id IS NULL in the update itself', async () => {
  const s = setup(base);
  const result = await s.POST(s.request({ action: 'assign', order_item_id: itemId, creator_id: creatorId }));
  assert.equal(result.status, 200);
  assert.equal(s.updates.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.updates[0].filters)).filter(f => f[1] === 'settlement_id'), [['is', 'settlement_id', null]]);
});
