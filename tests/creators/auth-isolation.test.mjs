import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path,imports){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,require:name=>{if(!(name in imports))throw new Error(`Missing ${name}`);return imports[name];},URL,Buffer,Date,crypto:globalThis.crypto,TextEncoder,Uint8Array});
 return module.exports;
}
const userId='10000000-0000-4000-8000-000000000001';
const creatorId='20000000-0000-4000-8000-000000000001';
const user={id:userId,email:'fictional@example.invalid',email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'}};
const creator={id:creatorId,user_id:userId,email:user.email,status:'active'};
const req=token=>({headers:new Headers(token?{authorization:`Bearer ${token}`}:{})});
function authSetup({identity=user,creatorRow=creator,membership=true}={}){
 const filters=[];let gets=0;
 const client={auth:{async getUser(){gets++;return{data:{user:identity},error:null};}},from(table){const query={select(){return query;},eq(column,value){filters.push({table,column,value});return query;},async maybeSingle(){return {data:table.endsWith('commerce_memberships')?(membership?{user_id:userId}:null):creatorRow,error:null};}};return query;}};
 const mod=load('../../src/lib/creator-auth.ts',{'server-only':{},'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/supabase':{supabaseAdmin:client},'@/lib/commerce-db':{commerceTable:name=>`preview_${name}`}});
 return {mod,filters,get gets(){return gets;}};
}
test('unauthenticated requests never query creator records or accept arbitrary tokens',async()=>{
 const s=authSetup();assert.equal(await s.mod.requireCreator(req()),null);assert.equal(s.gets,0);assert.equal(s.filters.length,0);
});
test('unverified email or non-Google account cannot use an invitation',async()=>{
 for(const identity of [{...user,email_confirmed_at:null},{...user,app_metadata:{provider:'email'}},null]){
  const s=authSetup({identity});assert.equal(await s.mod.requireCreator(req('fixture-token')),null);assert.equal(s.filters.length,0);
 }
});
test('creator identity requires active explicit membership and matching verified email',async()=>{
 const s=authSetup();assert.equal((await s.mod.requireCreator(req('fixture-token'))).id,creatorId);
 assert.ok(s.filters.some(row=>row.table==='preview_creators'&&row.column==='user_id'&&row.value===userId));
 assert.ok(s.filters.some(row=>row.column==='email'&&row.value===user.email));
 assert.ok(s.filters.some(row=>row.table==='preview_commerce_memberships'&&row.column==='role'&&row.value==='creator'));
 assert.ok(s.filters.some(row=>row.table==='preview_commerce_memberships'&&row.column==='creator_id'&&row.value===creatorId));
 const noMembership=authSetup({membership:false});assert.equal(await noMembership.mod.requireCreator(req('fixture-token')),null);
});

test('creator fulfillment loads only own paid order items and does not expose unrelated customer fields',async()=>{
 const filters=[];
 const ownItem={id:'item-a',creator_id:creatorId,order_id:'order-a',product_id:'product-a',quantity:1,fulfillment_status:'awaiting_acceptance',personalization:{text:'Fictional name'},created_at:'2026-01-01'};
 const rows={preview_order_items:[ownItem],preview_orders:[{id:'order-a',customer_name:'Fictional Buyer',customer_phone:'0000000000',shipping_address:'Fictional test address',status:'paid'}],preview_products:[{id:'product-a',name:'Fictional ornament'}]};
 const client={from(table){const query={select(columns){filters.push({table,columns});return query;},not(){return query;},order(){return query;},limit(){return query;},eq(column,value){filters.push({table,column,value});return query;},in(column,values){filters.push({table,column,values});return query;},then(resolve){resolve({data:rows[table],error:null});}};return query;}};
 const mod=load('../../src/lib/creator-data.ts',{'server-only':{},'@/lib/supabase':{supabaseAdmin:client},'@/lib/commerce-db':{commerceTable:name=>`preview_${name}`}});
 const result=await mod.creatorFulfillment(creatorId);
 assert.equal(result.length,1);assert.equal(result[0].id,'item-a');assert.equal(result[0].status,'assigned');
 assert.ok(filters.some(row=>row.table==='preview_order_items'&&row.column==='creator_id'&&row.value===creatorId));
 assert.deepEqual(Array.from(filters.find(row=>row.table==='preview_orders'&&row.column==='id').values),['order-a']);
 assert.equal(Object.hasOwn(result[0].shipping_address,'email'),false);assert.equal(Object.hasOwn(result[0],'unit_price'),false);
});

test('creator cannot skip fulfillment stages or mutate another creator item',async()=>{
 for(const item of [null,{id:'30000000-0000-4000-8000-000000000001',fulfillment_status:'awaiting_acceptance',order_id:'order-a'}]){
  let writes=0;const filters=[];
  const client={from(table){const query={select(){return query;},eq(column,value){filters.push({column,value});return query;},in(){return query;},not(){return query;},async maybeSingle(){return{data:table.endsWith('orders')?{id:'order-a'}:item,error:null};},update(){writes++;return query;}};return query;}};
  const mod=load('../../src/app/api/creator/fulfillment/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},'@/lib/supabase':{supabaseAdmin:client},'@/lib/commerce-db':{commerceTable:name=>`preview_${name}`},'@/lib/creator-auth':{requireCreator:async()=>creator,creatorDenied:()=>({status:403}),plainText:value=>typeof value==='string'?value:'',uuid:value=>typeof value==='string',safeHttps:()=>null,creatorAudit:async()=>{}},'@/lib/creator-types':{fulfillmentNext:{assigned:'accepted',accepted:'preparing',preparing:'ready',ready:'dispatched'}}});
  const response=await mod.POST({json:async()=>({id:'30000000-0000-4000-8000-000000000001',status:'dispatched',tracking_code:'fictional'})});
  assert.ok([403,409].includes(response.status));assert.equal(writes,0);
  assert.ok(filters.some(row=>row.column==='creator_id'&&row.value===creatorId));
 }
});
