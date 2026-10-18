import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function loadModule(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url),'utf8');
  const { outputText } = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const module = {exports:{}};
  const context = vm.createContext({module,exports:module.exports,require:(id)=>id in dependencies ? dependencies[id] : require(id),Buffer,URL,Uint8Array});
  new vm.Script(outputText,{filename:path}).runInContext(context);
  return module.exports;
}
const validation = loadModule('../src/lib/product-validation.ts',{});
const fixture = {id:'00000000-0000-4000-8000-000000000001',name:'Fixture',slug:'fixture',price:10000,stock:5,is_active:true,description:'Example',image_url:'https://example.com/a.jpg',customisation_note:'PRIVATE',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00.000Z',commerce:{storefronts:['christmas'],variants:[{id:'blue',name:'Blue',price:10000,stock:5}]}};
function setup() {
  let call;
  const client={from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table.endsWith('product_operations')?{details:{license_status:'owned'}}:fixture,error:null})})})}),rpc:async(name,args)=>{call={name,args};return {data:{...args.p_product,operations:args.p_operations},error:null}}};
  const mod=loadModule('../src/lib/product-admin.ts',{'server-only':{},'@/lib/supabase':{supabaseAdmin:client},'@/lib/commerce-db':{commerceTable:name=>`preview_${name}`},'@/lib/product-validation':validation});
  return {mod,getCall:()=>call};
}
test('create is always a draft and joins private operations only inside the owner RPC response', async()=>{
  const {mod,getCall}=setup();
  const product=await mod.saveOwnerProduct({name:'New product',price:100,is_active:true,operations:{license_status:'owned'}},'create');
  assert.equal(product.is_active,false);
  assert.equal(getCall().name,'preview_save_commerce_product');
  assert.equal(getCall().args.p_action,'create');
  assert.equal(getCall().args.p_product.operations,undefined);
  assert.equal(getCall().args.p_operations.license_status,'owned');
});
test('duplicate resets published state and stock, including variant stock',async()=>{
  const {mod,getCall}=setup();
  const product=await mod.saveOwnerProduct({id:fixture.id,action:'duplicate'},'update');
  assert.notEqual(product.id,fixture.id);
  assert.equal(product.stock,0);
  assert.equal(product.commerce.variants[0].stock,0);
  assert.equal(product.is_active,false);
  assert.equal(getCall().args.p_action,'duplicate');
});
test('stale editor inventory cannot overwrite changes made after loading',async()=>{
  const {mod,getCall}=setup();
  await assert.rejects(mod.saveOwnerProduct({id:fixture.id,name:'Overwritten',stock:99,updated_at:'2025-01-01T00:00:00.000Z'},'update'),/changed since/);
  assert.equal(getCall(),undefined);
});
test('publishing without license approval never reaches the database write',async()=>{
  const {mod,getCall}=setup();
  await assert.rejects(mod.saveOwnerProduct({id:fixture.id,action:'publish',operations:{license_status:'unverified'}},'update'),/commercial design rights/);
  assert.equal(getCall(),undefined);
});
test('archiving is a persisted state change and never deletes the canonical record',async()=>{
  const {mod,getCall}=setup();
  const product=await mod.saveOwnerProduct({id:fixture.id,action:'archive'},'update');
  assert.equal(product.id,fixture.id);
  assert.equal(product.is_active,false);
  assert.equal(product.commerce.archived,true);
  assert.equal(getCall().args.p_action,'archive');
});
