import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {gstBreakdown} from '../../src/lib/checkout-contract.ts';
import {orderPayoutLines,payoutConfig} from '../../src/lib/creator-payouts.ts';
// Runs the PREPARED phase B migration against disposable local Postgres (PGlite); never contacts any real database.
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const production=await read('../../supabase/commerce/checkout-phase-b.production.sql');
const preview=await read('../../supabase/commerce/checkout-phase-b.preview.sql');
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await read('../../supabase/migrations/20261016090236_commerce_preview_schema.sql'));
await db.exec(await read('../../supabase/commerce/payment-supplement.preview.sql'));
await db.exec(await read('../../supabase/commerce/checkout-phase-a.preview.sql'));
const legacyOrder=(await db.query("INSERT INTO preview_orders(customer_name,customer_email,customer_phone,shipping_address,total_amount,status) VALUES('Fictional Buyer','buyer@example.invalid','9000000000','Fictional legacy address',19900,'paid') RETURNING id")).rows[0].id;
await db.exec(preview);
// A stray public policy must not survive a re-run of the migration.
await db.exec("CREATE POLICY qa_wide_open ON public.preview_creators FOR SELECT TO anon USING (true)");
await db.exec(preview); // re-runnable

const creatorId='40000000-0000-4000-8000-0000000000b1';
const otherCreator='40000000-0000-4000-8000-0000000000b2';
await db.query(`INSERT INTO preview_creators(id,email,display_name,status,bio,photo_url,profession,profile_published) VALUES
 ($1,'maker@example.invalid','Fictional Maker','active','Fictional story','https://example.invalid/photo.jpg','Staff nurse',true),
 ($2,'hidden@example.invalid','Hidden Maker','active','Draft story',NULL,NULL,false)`,[creatorId,otherCreator]);
let seq=0;
const customer={name:'Fictional Buyer',email:'buyer@example.invalid',phone:'9000000000',address:'Fictional line, Testpur, Karnataka - 560001',state_code:'29',pincode:'560001'};
const config=payoutConfig({});
/** A creator line (rate 3%) and a PostDuty line (rate 12%), with the TypeScript tax snapshot the checkout would store. */
async function paidOrder({creator=creatorId,quantity=2,unitPrice=10000}={}){
 const n=++seq;const product=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const id=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.query('INSERT INTO preview_products(id,name,price,stock,is_active,commerce,slug) VALUES($1,$2,$3,10,true,$4,$5)',[product,'Fictional mug',unitPrice,{},`phase-b-${n}`]);
 const items=[
  {product_id:product,product_name:'Fictional mug',quantity,unit_price:unitPrice,creator_id:creator,line_discount_amount:0,hsn:'6912',gst_rate_bps:300},
  {product_id:product,product_name:'Fictional mug',quantity:1,unit_price:7000,creator_id:null,line_discount_amount:0,hsn:'6912',gst_rate_bps:1200},
 ];
 const shipping=quantity+1===1?4900:0;
 const tax=gstBreakdown(items,'29','29',true,{shipping,gift:0});
 const total=quantity*unitPrice+7000+shipping;
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,shipping_charge,total_amount,is_test,customer,tax_breakdown) VALUES($1,$2,'general',$3,$4,$5,$6,true,$7,$8)`,[id,`order_b${n}`,items,total-shipping,shipping,total,customer,tax]);
 const result=(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS r',[id,`pay_b${n}`,`order_b${n}`,total,'INR',true,null])).rows[0].r;
 return {...result,intent:id,product,total};
}
const one=async(sql,params)=>(await db.query(sql,params)).rows[0];
async function creatorLine(orderId){return one('SELECT id,order_id,creator_id,line_index,quantity,product_name,settlement_id FROM preview_order_items WHERE order_id=$1 AND creator_id IS NOT NULL',[orderId]);}
async function expectedPayout(orderId){
 const order=await one('SELECT id,status,created_at,courier_cost_paise,tax_breakdown FROM preview_orders WHERE id=$1',[orderId]);
 const items=(await db.query('SELECT id,order_id,creator_id,line_index,quantity,product_name FROM preview_order_items WHERE order_id=$1',[orderId])).rows;
 return orderPayoutLines({...order,created_at:new Date(order.created_at).toISOString()},items,config)[0].payout_paise;
}
const create=(lines,creator=creatorId,fees=[config.paymentFeeBps,config.platformFeeBps])=>db.query("SELECT preview_create_creator_settlement($1,'2026-10-12','2026-10-18',$2,'Fictional week',$3,$4) AS r",[creator,JSON.stringify(lines),...fees]);

test('financial year runs April–March in India time',async()=>{
 for(const [at,fy] of [['2026-03-31T18:29:59Z','2025-26'],['2026-03-31T18:30:00Z','2026-27'],['2026-10-17T12:00:00Z','2026-27'],['2099-12-31T00:00:00Z','2099-00']]) assert.equal((await one('SELECT preview_invoice_financial_year($1) AS fy',[at])).fy,fy,at);
});
test('finalized orders get gapless per-year numbers; retries keep the number; legacy orders get none',async()=>{
 const fy=(await one('SELECT preview_invoice_financial_year(now()) AS fy')).fy;
 const a=await paidOrder(),b=await paidOrder();
 const numbers=(await db.query('SELECT invoice_number,invoice_date FROM preview_orders WHERE id = ANY($1) ORDER BY invoice_number',[[a.order_id,b.order_id]])).rows;
 assert.deepEqual(numbers.map(r=>r.invoice_number),[`TEST/${fy}/0001`,`TEST/${fy}/0002`]);assert.ok(numbers[0].invoice_date);
 const retry=(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS r',[a.intent,'pay_b1','order_b1',a.total,'INR',true,null])).rows[0].r;
 assert.equal(retry.created,false);assert.equal((await one('SELECT invoice_number FROM preview_orders WHERE id=$1',[a.order_id])).invoice_number,`TEST/${fy}/0001`);
 assert.equal((await one('SELECT invoice_number FROM preview_orders WHERE id=$1',[legacyOrder])).invoice_number,null);
 await assert.rejects(db.query('SELECT preview_assign_invoice_number($1)',[legacyOrder]),/order_not_invoiceable/);
 // A failed finalization rolls the counter back with the order: the next order takes the next number, no gap.
 await db.exec(`CREATE FUNCTION fail_items() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'qa_failure'; END;$$; CREATE TRIGGER qa_fail BEFORE INSERT ON preview_order_items FOR EACH ROW EXECUTE FUNCTION fail_items();`);
 await assert.rejects(paidOrder(),/qa_failure/);
 await db.exec('DROP TRIGGER qa_fail ON preview_order_items; DROP FUNCTION fail_items();');
 const c=await paidOrder();
 assert.equal((await one('SELECT invoice_number FROM preview_orders WHERE id=$1',[c.order_id])).invoice_number,`TEST/${fy}/0003`);
 // Live orders use the separate PD/ series (assigned directly here; preview finalization rejects live payments).
 await db.query("UPDATE preview_orders SET is_test=false,invoice_number=NULL WHERE id=$1",[c.order_id]);
 assert.equal((await one('SELECT preview_assign_invoice_number($1) AS n',[c.order_id])).n,`PD/${fy}/0001`);
});
test('order lines record their snapshot position for tax and payout allocation',async()=>{
 const o=await paidOrder();
 assert.deepEqual((await db.query('SELECT line_index FROM preview_order_items WHERE order_id=$1 ORDER BY line_index',[o.order_id])).rows.map(r=>r.line_index),[0,1]);
});
test('SQL payout recomputation matches the TypeScript rules exactly',async()=>{
 for(const [quantity,unitPrice,courier,fees] of [[2,10000,8000,[236,0]],[1,9999,3333,[236,0]],[3,12345,1,[200,500]],[2,10000,0,[0,10000]],[1,25000,999999,[236,0]]]){
  const o=await paidOrder({quantity,unitPrice});
  await db.query('UPDATE preview_orders SET courier_cost_paise=$1 WHERE id=$2',[courier,o.order_id]);
  const line=await creatorLine(o.order_id);
  const order=await one('SELECT id,status,created_at,courier_cost_paise,tax_breakdown FROM preview_orders WHERE id=$1',[o.order_id]);
  const items=(await db.query('SELECT id,order_id,creator_id,line_index,quantity FROM preview_order_items WHERE order_id=$1',[o.order_id])).rows;
  const ts=orderPayoutLines({...order,created_at:new Date(order.created_at).toISOString()},items,{paymentFeeBps:fees[0],platformFeeBps:fees[1]})[0].payout_paise;
  const sql=(await one('SELECT preview_creator_line_payout($1,$2,$3,$4) AS p',[o.order_id,line.line_index,...fees])).p;
  assert.equal(sql,ts,JSON.stringify({quantity,unitPrice,courier,fees}));
 }
 const pending=await paidOrder();
 assert.equal((await one('SELECT preview_creator_line_payout($1,0,236,0) AS p',[pending.order_id])).p,null); // no courier cost yet
 await assert.rejects(db.query('SELECT preview_creator_line_payout($1,0,-1,0)',[pending.order_id]),/invalid_fee_configuration/);
});
test('settlements lock orders, accept only settleable checkout orders and reject amounts that differ from the recomputation',async()=>{
 const o=await paidOrder();await db.query('UPDATE preview_orders SET courier_cost_paise=8000 WHERE id=$1',[o.order_id]);
 const line=await creatorLine(o.order_id);const payout=await expectedPayout(o.order_id);
 await assert.rejects(create([{order_item_id:line.id,payout_paise:payout+1}]),/payout_mismatch/);
 await assert.rejects(create([{order_item_id:line.id,payout_paise:payout}],creatorId,[0,0]),/payout_mismatch/); // fees must match the configuration used
 const noCourier=await paidOrder();const pendingLine=await creatorLine(noCourier.order_id);
 await assert.rejects(create([{order_item_id:pendingLine.id,payout_paise:0}]),/payout_mismatch/);
 for(const status of ['cancelled','refunded','pending']){
  const x=await paidOrder();await db.query('UPDATE preview_orders SET courier_cost_paise=100,status=$1 WHERE id=$2',[status,x.order_id]);
  const l=await creatorLine(x.order_id);
  await assert.rejects(create([{order_item_id:l.id,payout_paise:await expectedPayout(x.order_id)??0}]),/order_not_settleable/,status);
 }
 const created=(await create([{order_item_id:line.id,payout_paise:payout}])).rows[0].r;
 assert.equal(created.amount_paise,payout);
 assert.deepEqual(await one('SELECT settlement_id,creator_payout_paise FROM preview_order_items WHERE id=$1',[line.id]),{settlement_id:created.id,creator_payout_paise:payout});
 // Settled lines are frozen: no second settlement, no cancellation or refund without a clawback.
 await assert.rejects(create([{order_item_id:line.id,payout_paise:payout}]),/already_settled/);
 await assert.rejects(db.query('SELECT preview_refund_order($1)',[o.order_id]),/settled_lines_require_clawback/);
 await assert.rejects(db.query('SELECT preview_cancel_paid_order($1)',[o.order_id]),/settled_lines_require_clawback/);
 assert.equal((await one('SELECT status FROM preview_orders WHERE id=$1',[o.order_id])).status,'paid');
});
test('settlement lifecycle: pending → approved → paid with a reference, each step audited',async()=>{
 const o=await paidOrder();await db.query('UPDATE preview_orders SET courier_cost_paise=5000 WHERE id=$1',[o.order_id]);
 const line=await creatorLine(o.order_id);
 const ownLine=(await one('SELECT id FROM preview_order_items WHERE order_id=$1 AND creator_id IS NULL',[o.order_id])).id;
 await assert.rejects(create([{order_item_id:ownLine,payout_paise:100}]),/line_unavailable_or_already_settled/);
 await assert.rejects(create([{order_item_id:line.id,payout_paise:100}],otherCreator),/line_unavailable_or_already_settled/);
 await assert.rejects(create([{order_item_id:line.id,payout_paise:-1}]),/invalid_settlement_line/);
 await assert.rejects(create([{order_item_id:line.id,payout_paise:1.5}]),/invalid_settlement_line/);
 await assert.rejects(create([]),/settlement_lines_required/);
 const payout=await expectedPayout(o.order_id);
 const created=(await create([{order_item_id:line.id,payout_paise:payout}])).rows[0].r;
 const settlement=await one('SELECT status,amount_paise,lines FROM preview_settlements WHERE id=$1',[created.id]);
 assert.equal(settlement.status,'pending');assert.equal(settlement.amount_paise,payout);
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','UPI-REF-123')",[created.id]),/invalid_settlement_transition/);
 await db.query('SELECT preview_approve_settlement($1)',[created.id]);
 await assert.rejects(db.query('SELECT preview_approve_settlement($1)',[created.id]),/invalid_settlement_transition/);
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','x')",[created.id]),/payment_reference_required/);
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,(now()+interval '3 days')::date,'UPI-REF-123')",[created.id]),/invalid_payment_date/);
 await db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','UPI-REF-123')",[created.id]);
 const paid=await one('SELECT status,paid_on::text AS paid_on,payment_reference,approved_at IS NOT NULL AS approved,paid_at IS NOT NULL AS stamped FROM preview_settlements WHERE id=$1',[created.id]);
 assert.deepEqual(paid,{status:'paid',paid_on:'2026-10-18',payment_reference:'UPI-REF-123',approved:true,stamped:true});
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','UPI-REF-123')",[created.id]),/invalid_settlement_transition/);
 assert.deepEqual((await db.query("SELECT action FROM preview_audit_events WHERE entity_id=$1",[created.id])).rows.map(r=>r.action).sort(),['settlement.approved','settlement.created','settlement.paid']);
 // The draft signature without fee parameters no longer exists.
 await assert.rejects(db.query("SELECT preview_create_creator_settlement($1,'2026-10-12','2026-10-18','[]'::jsonb,'x')",[creatorId]),/does not exist/);
});
test('public reads see only published, active creator profile columns; RLS is on and stray public policies are removed',async()=>{
 assert.equal((await one("SELECT relrowsecurity FROM pg_class WHERE oid='preview_creators'::regclass")).relrowsecurity,true);
 assert.deepEqual((await db.query("SELECT polname FROM pg_policy WHERE polrelid='preview_creators'::regclass")).rows.map(r=>r.polname),['creators_public_profile']);
 await db.query("INSERT INTO preview_creator_pickup_addresses(creator_id,pickup_name,phone,address,pincode,shiprocket_location) VALUES($1,'Fictional Maker','9000000000','Fictional workshop, Testpur','560001','FICTIONAL_1')",[creatorId]);
 await assert.rejects(db.query("INSERT INTO preview_creator_pickup_addresses(creator_id,pickup_name,phone,address,pincode) VALUES($1,'X Y','123','Fictional workshop, Testpur','560001')",[otherCreator]),/phone_check/);
 await db.exec('SET ROLE anon');
 try {
  const rows=(await db.query('SELECT id,display_name,bio,photo_url,profession FROM preview_creators')).rows;
  assert.deepEqual(rows,[{id:creatorId,display_name:'Fictional Maker',bio:'Fictional story',photo_url:'https://example.invalid/photo.jpg',profession:'Staff nurse'}]);
  for(const sql of ['SELECT email FROM preview_creators','SELECT * FROM preview_creators','SELECT commission_bps FROM preview_creators','SELECT * FROM preview_creator_pickup_addresses','SELECT * FROM preview_invoice_counters',"SELECT preview_mark_settlement_paid(gen_random_uuid(),current_date,'UPI-REF-1')","SELECT preview_create_creator_settlement(gen_random_uuid(),current_date,current_date,'[]','',236,0)","SELECT preview_creator_line_payout(gen_random_uuid(),0,236,0)"]) await assert.rejects(db.query(sql),/permission denied/,sql);
  await assert.rejects(db.query("UPDATE preview_creators SET bio='x'"),/permission denied/);
 } finally { await db.exec('RESET ROLE'); }
});
const code=s=>s.replace(/\r/g,'').split('\n').filter(line=>!line.startsWith('--')).join('\n');
test('production and preview files are identical apart from the preview_ prefix and the preview-only live-payment guard',()=>{
 const normalize=s=>code(s).split('\n').filter(line=>!line.includes('preview_rejects_live_payment')).join('\n').replace(/preview_/g,'').trim();
 assert.equal(normalize(preview),normalize(production));
 assert.doesNotMatch(code(production),/preview_/);assert.match(code(production),/catalog_only/);
 assert.match(code(production),/ALTER TABLE public\.creators ENABLE ROW LEVEL SECURITY;/);
 assert.match(production,/PRODUCTION ONLY/);assert.match(preview,/PREVIEW ONLY/);
 assert.equal((code(production).match(/^BEGIN;$/gm)??[]).length,1);assert.equal((code(preview).match(/^BEGIN;$/gm)??[]).length,1);
});
test.after(async()=>db.close());
