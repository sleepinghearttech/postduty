import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// Runs the PREPARED checkout phase A migration against disposable local Postgres (PGlite); never contacts any real database.
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const migration=await readFile(new URL('../../supabase/commerce/checkout-phase-a.prepared.sql',import.meta.url),'utf8');
const marker='-- PREVIEW SECTION (public.preview_*)';
const productionSection=migration.slice(migration.indexOf('-- PRODUCTION SECTION (public.*)'),migration.indexOf(marker));
const previewSection=migration.slice(migration.indexOf(marker));
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261016090236_commerce_preview_schema.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/commerce/payment-supplement.preview.sql',import.meta.url),'utf8'));
// Historical rows created BEFORE the migration must survive it unchanged.
const legacyProduct='10000000-0000-4000-8000-00000000a001';
await db.query("INSERT INTO preview_products(id,name,price,stock,is_active,commerce,slug) VALUES($1,'Fictional legacy item',19900,3,true,'{}','fictional-legacy')",[legacyProduct]);
const legacyOrder=(await db.query("INSERT INTO preview_orders(customer_name,customer_email,customer_phone,shipping_address,total_amount,status) VALUES('Fictional Buyer','buyer@example.invalid','9000000000','Fictional legacy address',19900,'delivered') RETURNING id")).rows[0].id;
await db.query("INSERT INTO preview_checkout_intents(id,storefront,items,subtotal,gift_charge,discount_amount,total_amount,is_test) VALUES('20000000-0000-4000-8000-00000000a001','general',$1,19900,2000,1000,20900,true)",[[{product_id:legacyProduct,quantity:1,unit_price:19900}]]);
await db.exec(previewSection);
await db.exec(previewSection); // re-runnable

let seq=0;
const customer={name:'Fictional Buyer',email:'buyer@example.invalid',phone:'9000000000',address:'Fictional line, Fictional City, Karnataka - 560001',address_line1:'Fictional line',address_line2:null,city:'Fictional City',state_code:'29',state:'Karnataka',pincode:'560001',country:'IN',terms_accepted_at:'2026-10-17T00:00:00.000Z'};
async function fixture({quantity=1,price=25000,stock=5,variant=false,shipping=quantity===1?4900:0}={}){
 const n=++seq;const product=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const id=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.query('INSERT INTO preview_products(id,name,price,stock,is_active,commerce,slug) VALUES($1,$2,$3,$4,true,$5,$6)',[product,'Fictional ornament',price,stock,{variants:variant?[{id:'red',name:'Red',price,stock},{id:'blue',name:'Blue',price,stock}]:[]},`phase-a-${n}`]);
 const items=[{product_id:product,product_name:'Fictional ornament',quantity,unit_price:price,variant_id:variant?'red':null,variant_name:variant?'Red':null,personalization:'Fictional name',creator_id:null,hsn:'7117',gst_rate_bps:300}];
 const tax={regime:'intra_state',total_tax:728};
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,shipping_charge,total_amount,is_test,customer,tax_breakdown) VALUES($1,$2,'general',$3,$4,$5,$6,true,$7,$8)`,[id,`order_a${n}`,items,quantity*price,shipping,quantity*price+shipping,customer,tax]);
 return {id,product,order:`order_a${n}`,payment:`pay_a${n}`,amount:quantity*price+shipping};
}
const finalize=async f=>(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS result',[f.id,f.payment,f.order,f.amount,'INR',true,null])).rows[0].result;
const cancel=async id=>(await db.query('SELECT preview_cancel_paid_order($1) AS result',[id])).rows[0].result;

test('legacy orders and intents are untouched: shipping defaults to zero and the old totals still satisfy the new CHECK',async()=>{
 const order=(await db.query('SELECT total_amount,status,shipping_amount,tax_breakdown,shipping_details FROM preview_orders WHERE id=$1',[legacyOrder])).rows[0];
 assert.deepEqual(order,{total_amount:19900,status:'delivered',shipping_amount:0,tax_breakdown:null,shipping_details:null});
 const intent=(await db.query("SELECT shipping_charge,total_amount FROM preview_checkout_intents WHERE id='20000000-0000-4000-8000-00000000a001'")).rows[0];
 assert.deepEqual(intent,{shipping_charge:0,total_amount:20900});
 const checks=(await db.query("SELECT conname,pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='preview_checkout_intents'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%total_amount =%'")).rows;
 assert.equal(checks.length,1);assert.equal(checks[0].conname,'preview_checkout_intents_total_consistency');assert.match(checks[0].def,/shipping_charge/);
});
test('total CHECK: total_amount must equal subtotal + gift_charge + shipping_charge - discount_amount; discounts cannot reach shipping',async()=>{
 const insert=(subtotal,gift,shipping,discount,total)=>db.query(`INSERT INTO preview_checkout_intents(storefront,items,subtotal,gift_charge,shipping_charge,discount_amount,total_amount,is_test) VALUES('general','[{"product_id":"x"}]',$1,$2,$3,$4,$5,true)`,[subtotal,gift,shipping,discount,total]);
 await insert(25000,2000,4900,2500,29400);
 await insert(50000,0,0,0,50000);
 await assert.rejects(insert(25000,0,4900,0,25000),/total_consistency/); // shipping omitted from the charge
 await assert.rejects(insert(25000,0,4900,0,30000),/total_consistency/);
 await assert.rejects(insert(25000,0,4900,26000,3900),/discount_within_subtotal/); // coupon eating into shipping
 await assert.rejects(insert(25000,0,-4900,0,20100),/shipping_charge_check/);
});
test('finalization copies shipping, tax snapshot, structured address and option name into the paid order',async()=>{
 const f=await fixture({variant:true});const result=await finalize(f);assert.equal(result.status,'confirmed');
 const order=(await db.query('SELECT total_amount,shipping_amount,tax_breakdown,shipping_details,shipping_address FROM preview_orders WHERE id=$1',[result.order_id])).rows[0];
 assert.equal(order.total_amount,29900);assert.equal(order.shipping_amount,4900);assert.equal(order.tax_breakdown.total_tax,728);
 assert.equal(order.shipping_details.pincode,'560001');assert.equal(order.shipping_details.state_code,'29');assert.equal('terms_accepted_at' in order.shipping_details,false);
 assert.equal(order.shipping_address,customer.address);
 const item=(await db.query('SELECT variant_id,variant_name,personalization FROM preview_order_items WHERE order_id=$1',[result.order_id])).rows[0];
 assert.deepEqual(item,{variant_id:'red',variant_name:'Red',personalization:{text:'Fictional name'}});
 const free=await fixture({quantity:2});const freeResult=await finalize(free);
 assert.equal((await db.query('SELECT shipping_amount,total_amount FROM preview_orders WHERE id=$1',[freeResult.order_id])).rows[0].shipping_amount,0);
});
test('cancelling a paid order restores parent and variant stock exactly once, in one transaction',async()=>{
 const f=await fixture({quantity:2,variant:true});const {order_id}=await finalize(f);
 let product=(await db.query('SELECT stock,commerce FROM preview_products WHERE id=$1',[f.product])).rows[0];
 assert.equal(product.stock,3);assert.equal(product.commerce.variants[0].stock,3);
 const cancelled=await cancel(order_id);assert.equal(cancelled.status,'cancelled');assert.ok(cancelled.cancelled_at);
 product=(await db.query('SELECT stock,commerce FROM preview_products WHERE id=$1',[f.product])).rows[0];
 assert.equal(product.stock,5);assert.equal(product.commerce.variants[0].stock,5);assert.equal(product.commerce.variants[1].stock,5);
 await assert.rejects(cancel(order_id),/invalid_status_transition/);
 assert.equal((await db.query('SELECT stock FROM preview_products WHERE id=$1',[f.product])).rows[0].stock,5);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM preview_audit_events WHERE action='order.cancelled' AND entity_id=$1",[order_id])).rows[0].n,1);
});
test('only paid orders can be cancelled; shipped, delivered, refunded and legacy orders keep their stock',async()=>{
 for(const status of ['shipped','delivered','refunded','pending']){
  const f=await fixture();const {order_id}=await finalize(f);
  await db.query('UPDATE preview_orders SET status=$1 WHERE id=$2',[status,order_id]);
  await assert.rejects(cancel(order_id),/invalid_status_transition/);
  assert.equal((await db.query('SELECT stock FROM preview_products WHERE id=$1',[f.product])).rows[0].stock,4,status);
 }
 await assert.rejects(cancel(legacyOrder),/invalid_status_transition/);
 await assert.rejects(cancel('30000000-0000-4000-8000-000000000999'),/order_not_found/);
});
test('a variant deleted after purchase still returns parent stock on cancel',async()=>{
 const f=await fixture({variant:true});const {order_id}=await finalize(f);
 await db.query(`UPDATE preview_products SET commerce=jsonb_set(commerce,'{variants}','[{"id":"blue","name":"Blue","price":25000,"stock":5}]') WHERE id=$1`,[f.product]);
 await cancel(order_id);
 const product=(await db.query('SELECT stock,commerce FROM preview_products WHERE id=$1',[f.product])).rows[0];
 assert.equal(product.stock,5);assert.deepEqual(product.commerce.variants.map(v=>v.stock),[5]);
});
test('anonymous role cannot cancel orders',async()=>{
 await db.exec('SET ROLE anon');
 await assert.rejects(db.query(`SELECT preview_cancel_paid_order('30000000-0000-4000-8000-000000000001')`),/permission denied/);
 await db.exec('RESET ROLE');
});
test('production and preview sections are identical apart from the preview_ prefix and the preview-only live-payment guard',()=>{
 const normalize=s=>s.split('\n').filter(line=>!line.startsWith('-- ')&&!line.includes('preview_rejects_live_payment')).join('\n').replace(/preview_/g,'').trim();
 assert.equal(normalize(previewSection),normalize(productionSection));
 assert.match(productionSection,/catalog_only/);assert.doesNotMatch(productionSection,/preview_/);
 assert.match(previewSection,/preview_rejects_live_payment/);
});
test.after(async()=>db.close());
