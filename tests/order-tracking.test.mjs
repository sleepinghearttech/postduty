import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { customerOrderTracking, customerTrackingUrl, normalizeTrackingPhone } from '../src/lib/order-tracking.ts';
import { validOrderReference } from '../src/components/commerce/order-outcome.ts';

const orderId = '00000000-0000-4000-8000-000000000001';
const fixture = { id:orderId,status:'paid',tracking_number:null,total_amount:25900,customer_phone:'+91 90000 00000',created_at:'2026-10-16T10:00:00Z',is_test:true };
const items = [
  {id:'item-a',quantity:1,unit_price:15900,product_name:'Fictional ornament',creator_id:'creator-a',fulfillment_status:'dispatched',tracking_number:'FICTIONAL-A',courier:'Fictional courier',tracking_url:'https://example.invalid/track/a',products:{name:'Renamed item'},creator_earning_paise:12000},
  {id:'item-b',quantity:2,unit_price:5000,product_name:'Fictional crochet',creator_id:'creator-b',fulfillment_status:'preparing',tracking_number:null,courier:null,tracking_url:null,products:{name:'Fictional crochet'},commission_bps:2000},
];
function setup({order=fixture,orderError=null,itemError=null,legacyError=null}={}) {
  const calls=[];
  const database={from(table){const call={table};calls.push(call);const q={
    select(columns){call.columns=columns;return q;},eq(column,value){call.filter=[column,value];return q;},
    async maybeSingle(){return {data:order,error:call.columns.includes('is_test')?orderError:null};},
    async order(){return {data:items,error:call.columns.includes('fulfillment_status')?itemError:legacyError};},
    async in(column,values){call.ids=values;return {data:[{id:'creator-a',display_name:'Fictional Maker A'},{id:'creator-b',display_name:'Fictional Maker B'}],error:null};},
  };return q;}};
  const source=readFileSync(new URL('../src/app/api/order-lookup/route.ts',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const dependencies={
    '@/lib/commerce-db':{commerceTable:name=>`preview_${name}`},
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}},
    '@/lib/supabase':{supabaseAdmin:database},
    '@/lib/order-tracking':{customerOrderTracking,normalizeTrackingPhone},
    '@/components/commerce/order-outcome':{validOrderReference},
  };
  const module={exports:{}};
  vm.runInNewContext(outputText,{module,exports:module.exports,require:name=>dependencies[name],Map,Set,JSON});
  return {route:module.exports,calls,request:(body,contentLength)=>({headers:new Headers(contentLength?{'content-length':String(contentLength)}:{}),text:async()=>typeof body==='string'?body:JSON.stringify(body)})};
}

test('phone gate rejects malformed, short and mismatched inputs before shipment queries',async()=>{
  for(const body of ['{bad',[],{orderId,phone:'123'},{orderId:'invalid',phone:'9000000000'}]){
    const s=setup();const result=await s.route.POST(s.request(body));assert.equal(result.status,400);assert.equal(s.calls.length,0);assert.equal(result.headers['Cache-Control'],'private, no-store');
  }
  const s=setup();const result=await s.route.POST(s.request({orderId,phone:'9111111111'}));assert.equal(result.status,404);assert.equal(s.calls.length,1);assert.equal(Object.hasOwn(result.body,'items'),false);
  const missing=setup({order:null});assert.equal(JSON.stringify((await missing.route.POST(missing.request({orderId,phone:'9000000000'}))).body),JSON.stringify(result.body));
});

test('oversized bodies fail without database access and phone normalization preserves country-code tolerance',async()=>{
  const s=setup();assert.equal((await s.route.POST(s.request('x'.repeat(4097)))).status,413);assert.equal((await s.route.POST(s.request('{}',5000))).status,413);assert.equal(s.calls.length,0);
  assert.equal(normalizeTrackingPhone('+91 90000 00000'),'9000000000');assert.equal(normalizeTrackingPhone('09000000000'),'9000000000');assert.equal(normalizeTrackingPhone('000000000'),null);
});

test('two creators retain independent item shipment updates without financial/private fields',async()=>{
  const s=setup();const result=await s.route.POST(s.request({orderId,phone:'9000000000'}));assert.equal(result.status,200);
  assert.equal(result.body.items[0].name,'Fictional ornament');assert.equal(result.body.items[0].fulfillmentStatus,'dispatched');assert.equal(result.body.items[0].trackingNumber,'FICTIONAL-A');assert.equal(result.body.items[0].courier,'Fictional courier');assert.equal(result.body.items[0].trackingUrl,'https://example.invalid/track/a');assert.equal(result.body.items[0].creatorName,'Fictional Maker A');
  assert.equal(result.body.items[1].fulfillmentStatus,'preparing');assert.equal(result.body.items[1].trackingNumber,null);assert.equal(result.body.items[1].creatorName,'Fictional Maker B');
  const serialized=JSON.stringify(result.body);for(const field of ['customer_phone','shipping_address','creator_earning_paise','commission_bps','creator_id','email'])assert.equal(serialized.includes(field),false);
  assert.equal(s.calls[2].columns,'id,display_name');assert.deepEqual(Array.from(s.calls[2].ids),['creator-a','creator-b']);assert.equal(result.headers['Cache-Control'],'private, no-store');
});

test('legacy order tracking remains visible without inventing item shipment data',()=>{
  const result=customerOrderTracking({...fixture,status:'shipped',tracking_number:'LEGACY-TRACK'},[{id:'old-item',quantity:1,unit_price:100,products:{name:'Historical item'},fulfillment_status:'awaiting_acceptance'}],new Map());
  assert.equal(result.trackingNumber,'LEGACY-TRACK');assert.equal(result.items[0].fulfillmentStatus,null);assert.equal(result.items[0].trackingNumber,null);assert.equal(result.items[0].trackingUrl,null);assert.equal(result.items[0].creatorName,null);
});

test('legacy order schema fallback is limited to missing-column errors',async()=>{
  const s=setup({orderError:{code:'42703'}});assert.equal((await s.route.POST(s.request({orderId,phone:'9000000000'}))).status,200);assert.equal(s.calls.filter(c=>c.table==='preview_orders').length,2);
  const failed=setup({orderError:{code:'42501'}});assert.equal((await failed.route.POST(failed.request({orderId,phone:'9000000000'}))).status,404);assert.equal(failed.calls.length,1);
});

test('only missing-column database errors permit the legacy item query',async()=>{
  const s=setup({itemError:{code:'42703'}});assert.equal((await s.route.POST(s.request({orderId,phone:'9000000000'}))).status,200);assert.equal(s.calls.filter(c=>c.table==='preview_order_items').length,2);
  const failed=setup({itemError:{code:'42501'}});assert.equal((await failed.route.POST(failed.request({orderId,phone:'9000000000'}))).status,503);assert.equal(failed.calls.filter(c=>c.table==='preview_order_items').length,1);
});

test('courier links are supplied HTTPS URLs only, never synthesized from tracking IDs',()=>{
  for(const value of [null,'','javascript:alert(1)','http://example.invalid','https://user:secret@example.invalid/track','not a URL'])assert.equal(customerTrackingUrl(value),null);
  assert.equal(customerTrackingUrl('https://example.invalid/track?id=ABC'),'https://example.invalid/track?id=ABC');
  assert.equal(customerOrderTracking(fixture,[{...items[0],tracking_url:'javascript:alert(1)'}],new Map()).items[0].trackingUrl,null);
});
