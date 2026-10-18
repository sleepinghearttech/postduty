import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as input from '../../src/lib/creator-product-input.ts';

const me = { id: '40000000-0000-4000-8000-0000000000f1', user_id: 'user-me', status: 'active' };
const other = '40000000-0000-4000-8000-0000000000f2';
const plain = v => JSON.parse(JSON.stringify(v));
function load(path, { creator = me, rpcError = null } = {}) {
  const calls = [];
  const builder = table => { const state = { table, filters: [] }; calls.push(state); const q = { select() { return q; }, eq(c, v) { state.filters.push([c, v]); return q; }, order() { return q; }, async limit() { return { data: [], error: null }; } }; return q; };
  const supabaseAdmin = { from: builder, async rpc(name, args) { calls.push({ rpc: name, args }); return { data: rpcError ? null : { mode: 'revision_pending', product_id: args.p_product_id }, error: rpcError }; } };
  const deps = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/supabase': { supabaseAdmin }, '@/lib/commerce-db': { commerceTable: n => `preview_${n}`, isCommerceSandbox: () => true },
    '@/lib/creator-auth': { requireCreator: async () => creator, creatorDenied: () => ({ body: { error: 'denied' }, status: 403 }), creatorAudit: async (...args) => { calls.push({ audit: args }); } },
    '@/lib/creator-product-input': input,
    '@/lib/creator-statement': { loadWeeklyStatement: async (creatorId, week) => { calls.push({ statement: [creatorId, week] }); return { creator_id: creatorId, lines: [] }; } },
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require: id => { if (!(id in deps)) throw new Error(`Unexpected ${id}`); return deps[id]; }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.example.invalid' } }, URL, Headers }));
  return { route: module.exports, calls };
}
const req = (body, url = 'https://preview.example/api/creator/products') => ({ headers: new Headers(), json: async () => body, nextUrl: new URL(url) });
const media = `https://project.example.invalid/storage/v1/object/public/commerce-preview-media/x.jpg`;

test('only an active invited creator can use self-service; outsiders reach no database call', async () => {
  for (const path of ['../../src/app/api/creator/products/route.ts', '../../src/app/api/creator/statement/route.ts']) {
    const s = load(path, { creator: null });
    const result = await s.route.GET(req({}, 'https://preview.example/x?week=2026-10-12'));
    assert.equal(result.status, 403); assert.equal(s.calls.length, 0);
  }
  const s = load('../../src/app/api/creator/products/route.ts', { creator: null });
  assert.equal((await s.route.POST(req({ name: 'Fictional pouch' }))).status, 403); assert.equal(s.calls.length, 0);
});
test('the creator identity always comes from the verified session, never from the request body', async () => {
  const s = load('../../src/app/api/creator/products/route.ts');
  const result = await s.route.POST(req({ product_id: '10000000-0000-4000-8000-0000000000f1', creator_id: other, name: 'Fictional pouch v2', price: 1, storefronts: ['christmas'], media: [{ url: media, type: 'image' }] }));
  assert.equal(result.status, 200); assert.match(result.body.message, /owner for approval/);
  const rpc = plain(s.calls.find(c => c.rpc));
  assert.equal(rpc.rpc, 'preview_creator_save_product'); assert.equal(rpc.args.p_creator_id, me.id);
  assert.deepEqual(Object.keys(rpc.args.p_fields).sort(), ['media', 'name']);
  assert.ok(s.calls.some(c => c.audit));
  const list = load('../../src/app/api/creator/products/route.ts');
  await list.route.GET(req({}));
  assert.ok(list.calls.filter(c => c.table).every(c => c.filters.some(([col, v]) => col === 'creator_id' && v === me.id)));
});
test('another creator’s product is indistinguishable from a missing one; owner-only edits and outside media are refused', async () => {
  const s = load('../../src/app/api/creator/products/route.ts', { rpcError: { message: 'not_your_product' } });
  const result = await s.route.POST(req({ product_id: '10000000-0000-4000-8000-0000000000f9', name: 'Taken over' }));
  assert.deepEqual([result.status, result.body.error], [404, 'Product not found.']);
  const t = load('../../src/app/api/creator/products/route.ts');
  assert.equal((await t.route.POST(req({ name: 'Fine name', media: [{ url: 'https://elsewhere.example/x.jpg', type: 'image' }] }))).status, 400);
  assert.equal(t.calls.some(c => c.rpc), false);
});
test('statements and settlements are read for the signed-in creator only', async () => {
  const s = load('../../src/app/api/creator/statement/route.ts');
  const result = await s.route.GET(req({}, 'https://preview.example/api/creator/statement?week=2026-10-14'));
  assert.equal(result.status, 200);
  assert.deepEqual(plain(s.calls.find(c => c.statement).statement), [me.id, '2026-10-14']);
  const settlements = s.calls.find(c => c.table === 'preview_settlements');
  assert.deepEqual(plain(settlements.filters), [['creator_id', me.id]]);
  assert.equal((await s.route.GET(req({}, 'https://preview.example/api/creator/statement?week=bad'))).status, 400);
});
