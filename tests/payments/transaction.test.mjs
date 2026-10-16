import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// Run against disposable local Postgres (PGlite); never contacts production.
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261016090236_commerce_preview_schema.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/commerce/payment-supplement.preview.sql',import.meta.url),'utf8'));
let seq=0;
const customer={name:'Fictional Buyer',email:'buyer@example.invalid',phone:'9999999999',address:'Fictional QA address only'};
async function fixture({stock=5,quantity=2,price=25000,variant=false,customerData=customer,coupon=null,productId=null}={}){
 const n=++seq; const product=productId ?? `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`; const id=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 if(!productId) await db.query('INSERT INTO preview_products(id,name,price,stock,is_active,commerce,slug) VALUES($1,$2,$3,$4,true,$5,$6)',[product,'Fictional ornament',price,stock,{variants:variant?[{id:'red',name:'Red',price,stock}]:[]},`fictional-${n}`]);
 const items=[{product_id:product,product_name:'Fictional ornament',quantity,unit_price:price,variant_id:variant?'red':null,personalization:'Test',creator_id:null}];
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,total_amount,is_test,customer,coupon_code) VALUES($1,$2,'christmas',$3,$4,$4,true,$5,$6)`,[id,`order_${n}`,items,quantity*price,customerData,coupon]);
 return {id,product,order:`order_${n}`,payment:`pay_${n}`,amount:quantity*price};
}
const finalize=async(f,overrides={})=>{const args={id:f.id,payment:f.payment,order:f.order,amount:f.amount,currency:'INR',test:true,customer:null,...overrides};return(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS result',Object.values(args))).rows[0].result;};

test('transaction confirms snapshot, decrements stock once and serializes callback/webhook retries',async()=>{
 const f=await fixture({variant:true});
 const [a,b]=await Promise.all([finalize(f),finalize(f)]);
 assert.equal(a.status,'confirmed');assert.equal(b.status,'confirmed');assert.equal(a.order_id,b.order_id);assert.equal([a,b].filter(r=>r.created).length,1);
 const p=(await db.query('SELECT stock,commerce FROM preview_products WHERE id=$1',[f.product])).rows[0];
 assert.equal(p.stock,3);assert.equal(p.commerce.variants[0].stock,3);
 const order=(await db.query('SELECT * FROM preview_orders WHERE id=$1',[a.order_id])).rows[0];assert.equal(order.total_amount,50000);assert.equal(order.payment_mode,'test');assert.equal(order.is_test,true);
 const items=(await db.query('SELECT * FROM preview_order_items WHERE order_id=$1',[a.order_id])).rows;assert.equal(items.length,1);assert.equal(items[0].unit_price,25000);assert.equal(items[0].personalization.text,'Test');
 assert.equal((await db.query('SELECT status FROM preview_payment_notification_jobs WHERE order_id=$1',[a.order_id])).rows[0].status,'suppressed_test');
});
test('competing buyers cannot oversell; second captured payment stays visible for reconciliation',async()=>{
 const one=await fixture({stock:1,quantity:1});const two=await fixture({productId:one.product,quantity:1});
 const results=await Promise.all([finalize(one),finalize(two)]);
 assert.equal(results.filter(r=>r.status==='confirmed').length,1);assert.equal(results.filter(r=>r.status==='reconciliation_required').length,1);
 assert.equal((await db.query('SELECT stock FROM preview_products WHERE id=$1',[one.product])).rows[0].stock,0);
 const capture=(await db.query('SELECT order_id,reason FROM preview_checkout_payments WHERE intent_id=$1',[two.id])).rows[0];assert.equal(capture.order_id,null);assert.equal(capture.reason,'inventory_unavailable');
});
test('underpayment, wrong currency, wrong order and live mode cannot write paid orders',async()=>{
 const f=await fixture();
 for(const change of [{amount:1},{currency:'USD'},{order:'order_wrong'},{test:false}]) await assert.rejects(finalize(f,change),/payment_mismatch|preview_rejects_live/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_orders WHERE checkout_intent_id=$1',[f.id])).rows[0].n,0);
 assert.equal((await db.query('SELECT stock FROM preview_products WHERE id=$1',[f.product])).rows[0].stock,5);
});
test('snapshot price survives later catalog changes',async()=>{
 const f=await fixture();await db.query('UPDATE preview_products SET price=1 WHERE id=$1',[f.product]);const result=await finalize(f);
 assert.equal((await db.query('SELECT total_amount FROM preview_orders WHERE id=$1',[result.order_id])).rows[0].total_amount,50000);
});
test('webhook-before-client retains capture then accepts customer details once',async()=>{
 const f=await fixture({customerData:null});assert.equal((await finalize(f)).status,'awaiting_customer');
 const r=await finalize(f,{customer});assert.equal(r.status,'confirmed');
 await finalize(f,{customer:{...customer,address:'Altered invalid follow-up address'}});
 assert.equal((await db.query('SELECT shipping_address FROM preview_orders WHERE id=$1',[r.order_id])).rows[0].shipping_address,customer.address);
});
test('duplicate captured payment cannot bind to another intent',async()=>{
 const f=await fixture();await finalize(f);const other=await fixture();await assert.rejects(finalize(other,{payment:f.payment}),/payment_already_bound/);
 assert.equal((await db.query('SELECT stock FROM preview_products WHERE id=$1',[other.product])).rows[0].stock,5);
});
test('coupon capacity is locked and not incremented on payment retries',async()=>{
 await db.query(`INSERT INTO preview_coupons(code,max_uses,times_used,discount_value) VALUES('QA',1,0,10)`);
 const first=await fixture({coupon:'QA'});const second=await fixture({coupon:'QA'});
 assert.equal((await finalize(first)).status,'confirmed');assert.equal((await finalize(first)).created,false);assert.equal((await finalize(second)).reason,'coupon_capacity_reached');
 assert.equal((await db.query(`SELECT times_used FROM preview_coupons WHERE code='QA'`)).rows[0].times_used,1);
});
test('SQL rollback leaves no partial orders, items or stock on failure',async()=>{
 const f=await fixture();
 // Server records verified capture in an earlier transaction before finalization.
 await db.query(`INSERT INTO preview_checkout_payments(provider_payment_id,provider_order_id,intent_id,amount,currency,is_test) VALUES($1,$2,$3,$4,'INR',true)`,[f.payment,f.order,f.id,f.amount]);
 await db.exec(`CREATE FUNCTION reject_qa_item() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'qa_write_failure'; END;$$; CREATE TRIGGER qa_reject BEFORE INSERT ON preview_order_items FOR EACH ROW EXECUTE FUNCTION reject_qa_item();`);
 await assert.rejects(finalize(f),/qa_write_failure/);
 await db.exec('DROP TRIGGER qa_reject ON preview_order_items; DROP FUNCTION reject_qa_item();');
 assert.equal((await db.query('SELECT status FROM preview_checkout_payments WHERE intent_id=$1',[f.id])).rows[0].status,'captured');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_orders WHERE checkout_intent_id=$1',[f.id])).rows[0].n,0);
 assert.equal((await db.query('SELECT stock FROM preview_products WHERE id=$1',[f.product])).rows[0].stock,5);
 assert.equal((await finalize(f)).status,'confirmed');
});
test('paid order preserves discount, original creator and commission snapshots after creator terms change',async()=>{
 const creatorId='40000000-0000-4000-8000-000000000001';
 await db.query("INSERT INTO preview_creators(id,email,display_name,status,commission_bps) VALUES($1,'creator@example.invalid','Fictional Creator','active',9000)",[creatorId]);
 const f=await fixture({price:10001,quantity:1});
 const line={product_id:f.product,product_name:'Fictional ornament',quantity:1,unit_price:10001,variant_id:null,personalization:null,creator_id:creatorId,commission_bps:1250,line_discount_amount:101,commission_amount:1238,creator_earning_paise:8662};
 await db.query('UPDATE preview_checkout_intents SET items=$1,discount_amount=101,total_amount=9900 WHERE id=$2',[[line],f.id]);
 f.amount=9900;
 const result=await finalize(f);
 const saved=(await db.query('SELECT commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id,earnings_review_required FROM preview_order_items WHERE order_id=$1',[result.order_id])).rows[0];
 assert.deepEqual(saved,{commission_bps:1250,line_discount_amount:101,commission_amount:1238,creator_earning_paise:8662,earnings_creator_id:creatorId,earnings_review_required:false});
 await finalize(f);
 assert.equal((await db.query('SELECT sum(creator_earning_paise)::int AS earnings FROM preview_order_items WHERE order_id=$1',[result.order_id])).rows[0].earnings,8662);
});
test('anonymous database role cannot invoke paid-order finalization or read private checkout details',async()=>{
 await db.exec('SET ROLE anon');
 await assert.rejects(db.query('SELECT * FROM preview_checkout_intents'),/permission denied/);
 await assert.rejects(db.query(`SELECT preview_finalize_checkout_payment(gen_random_uuid(),'pay_denied','order_denied',100,'INR',true,NULL)`),/permission denied/);
 await db.exec('RESET ROLE');
});
test.after(async()=>db.close());
