import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/product-validation.ts',import.meta.url),'utf8');
const { outputText } = ts.transpileModule(source,{ compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const v = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('price accepts integer paise conversion and rejects rounding, negative or non-finite values', () => {
  assert.equal(v.validateProductInput({ name:'Example',price:199.99 }).price,19999);
  for (const price of [-1,1.999,NaN,Infinity,'199',21474836.48]) assert.throws(()=>v.validateProductInput({ name:'Example',price }));
});
test('create input cannot publish or expose operations through public commerce JSON', () => {
  const result = v.validateProductInput({ name:'Example',price:99,is_active:true,commerce:{ storefronts:['christmas'],cost_price:12,operations:{cost:10} } });
  assert.equal(result.is_active,undefined);
  assert.deepEqual(result.commerce,{storefronts:['christmas']});
});
test('drafts may be incomplete while publication requires commercial rights, photo and storefront', () => {
  assert.equal(v.validateProductInput({ name:'Example' }).price,0);
  const good = {name:'Example',price:100,image_url:'https://example.com/a.jpg',commerce:{storefronts:['christmas']},operations:{license_status:'owned'}};
  assert.doesNotThrow(()=>v.validatePublication(good));
  for (const patch of [{price:0},{image_url:null},{operations:{}},{commerce:{}},{commerce:{storefronts:['christmas'],archived:true}}]) assert.throws(()=>v.validatePublication({...good,...patch}));
});
test('variants require unique IDs, integer stock and exact integer paise prices', () => {
  const variant={id:'blue',name:'Blue',price:100,stock:2};
  assert.throws(()=>v.validateCommerce({variants:[variant,variant]}));
  assert.throws(()=>v.validateCommerce({variants:[{...variant,price:1.2}]}));
  assert.throws(()=>v.validateCommerce({variants:[{...variant,stock:-1}]}));
  assert.throws(()=>v.validateCommerce({storefronts:['third']}));
});
test('unsafe media schemes and active upload formats cannot pass', () => {
  for (const url of ['javascript:alert(1)','data:image/svg+xml,<svg/>','//evil.test/a.jpg','http://example.com/a.jpg','/../private','https://user:pass@example.com/a.jpg']) assert.throws(()=>v.safeMediaUrl(url));
  assert.equal(v.safeMediaUrl('https://example.com/a.jpg'),'https://example.com/a.jpg');
  assert.throws(()=>v.validateMediaFile('image/png',new TextEncoder().encode('<html>bad</html>')));
  assert.throws(()=>v.validateMediaFile('image/svg+xml',new TextEncoder().encode('<svg/>')));
  assert.deepEqual(v.validateMediaFile('image/png',new Uint8Array([137,80,78,71,13,10,26,10])),{type:'image',extension:'png'});
});
test('private operations reject prototype payloads and invalid licensing values', () => {
  assert.throws(()=>v.validateOperations(JSON.parse('{"__proto__":{"admin":true}}')));
  assert.throws(()=>v.validateOperations({license_status:'unknown'}));
  assert.throws(()=>v.validateOperations({costs_rupees:{materials:-5}}));
  assert.throws(()=>v.validateOperations({commission_percent:101}));
  assert.deepEqual(v.validateOperations({license_status:'unverified',costs_rupees:{materials:10}}),{license_status:'unverified',costs_rupees:{materials:10}});
});
test('product tables and saving function default to private writes, protect procurement notes and preserve history', () => {
  const sql=readFileSync(new URL('../supabase/migrations/20261016090236_commerce_preview_schema.sql',import.meta.url),'utf8');
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.preview_save_commerce_product[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/is_active boolean NOT NULL DEFAULT false/);
  const grant=sql.match(/GRANT SELECT \(([^)]+)\) ON public\.preview_products/)[1];
  assert.ok(!grant.includes('customisation_note'));
  assert.match(sql,/product_id uuid NOT NULL REFERENCES public\.preview_products\(id\)/);
  assert.match(sql,/FOR UPDATE/);
});
