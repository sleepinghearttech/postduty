import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// Runs the PREPARED phase B migration against disposable local Postgres (PGlite); never contacts any real database.
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const section=sql=>sql.slice(sql.indexOf('-- PREVIEW SECTION (public.preview_*)'));
const phaseB=await read('../../supabase/commerce/checkout-phase-b.prepared.sql');
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await read('../../supabase/migrations/20261016090236_commerce_preview_schema.sql'));
await db.exec(await read('../../supabase/commerce/payment-supplement.preview.sql'));
await db.exec(section(await read('../../supabase/commerce/checkout-phase-a.prepared.sql')));
const legacyOrder=(await db.query("INSERT INTO preview_orders(customer_name,customer_email,customer_phone,shipping_address,total_amount,status) VALUES('Fictional Buyer','buyer@example.invalid','9000000000','Fictional legacy address',19900,'paid') RETURNING id")).rows[0].id;
await db.exec(section(phaseB));
await db.exec(section(phaseB)); // re-runnable

const creatorId='40000000-0000-4000-8000-0000000000b1';
const otherCreator='40000000-0000-4000-8000-0000000000b2';
await db.query(`INSERT INTO preview_creators(id,email,display_name,status,bio,photo_url,profession,profile_published) VALUES
 ($1,'maker@example.invalid','Fictional Maker','active','Fictional story','https://example.invalid/photo.jpg','Staff nurse',true),
 ($2,'hidden@example.invalid','Hidden Maker','active','Draft story',NULL,NULL,false)`,[creatorId,otherCreator]);
let seq=0;
const customer={name:'Fictional Buyer',email:'buyer@example.invalid',phone:'9000000000',address:'Fictional line, Testpur, Karnataka - 560001',state_code:'29',pincode:'560001'};
async function paidOrder({creator=creatorId,quantity=2}={}){
 const n=++seq;const product=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const id=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.query('INSERT INTO preview_products(id,name,price,stock,is_active,commerce,slug) VALUES($1,$2,10000,10,true,$3,$4)',[product,'Fictional mug',{},`phase-b-${n}`]);
 const items=[{product_id:product,product_name:'Fictional mug',quantity,unit_price:10000,creator_id:creator},{product_id:product,product_name:'Fictional mug',quantity:1,unit_price:10000,creator_id:null}];
 const total=(quantity+1)*10000;
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,total_amount,is_test,customer,tax_breakdown) VALUES($1,$2,'general',$3,$4,$4,true,$5,'{}')`,[id,`order_b${n}`,items,total,customer]);
 const result=(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS r',[id,`pay_b${n}`,`order_b${n}`,total,'INR',true,null])).rows[0].r;
 return {...result,intent:id,product};
}
const one=async(sql,params)=>(await db.query(sql,params)).rows[0];

test('financial year runs April–March in India time',async()=>{
 for(const [at,fy] of [['2026-03-31T18:29:59Z','2025-26'],['2026-03-31T18:30:00Z','2026-27'],['2026-10-17T12:00:00Z','2026-27'],['2099-12-31T00:00:00Z','2099-00']]) assert.equal((await one('SELECT preview_invoice_financial_year($1) AS fy',[at])).fy,fy,at);
});
test('finalized orders get gapless per-year numbers; retries keep the number; legacy orders get none',async()=>{
 const fy=(await one('SELECT preview_invoice_financial_year(now()) AS fy')).fy;
 const a=await paidOrder(),b=await paidOrder();
 const numbers=(await db.query('SELECT invoice_number,invoice_date FROM preview_orders WHERE id = ANY($1) ORDER BY invoice_number',[[a.order_id,b.order_id]])).rows;
 assert.deepEqual(numbers.map(r=>r.invoice_number),[`TEST/${fy}/0001`,`TEST/${fy}/0002`]);assert.ok(numbers[0].invoice_date);
 const retry=(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS r',[a.intent,'pay_b1','order_b1',30000,'INR',true,null])).rows[0].r;
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
 assert.deepEqual((await db.query('SELECT line_index,creator_id FROM preview_order_items WHERE order_id=$1 ORDER BY line_index',[o.order_id])).rows.map(r=>r.line_index),[0,1]);
});
test('settlement lifecycle: lines settle once, pending → approved → paid with a reference, each step audited',async()=>{
 const o=await paidOrder();
 const creatorLine=(await one('SELECT id FROM preview_order_items WHERE order_id=$1 AND creator_id=$2',[o.order_id,creatorId])).id;
 const ownLine=(await one('SELECT id FROM preview_order_items WHERE order_id=$1 AND creator_id IS NULL',[o.order_id])).id;
 const create=(lines,creator=creatorId)=>db.query("SELECT preview_create_creator_settlement($1,'2026-10-12','2026-10-18',$2,'Fictional week') AS r",[creator,JSON.stringify(lines)]);
 await assert.rejects(create([{order_item_id:ownLine,payout_paise:100}]),/line_unavailable_or_already_settled/);
 await assert.rejects(create([{order_item_id:creatorLine,payout_paise:100}],otherCreator),/line_unavailable_or_already_settled/);
 await assert.rejects(create([{order_item_id:creatorLine,payout_paise:-1}]),/invalid_settlement_line/);
 await assert.rejects(create([{order_item_id:creatorLine,payout_paise:1.5}]),/invalid_settlement_line/);
 await assert.rejects(create([]),/settlement_lines_required/);
 const created=(await create([{order_item_id:creatorLine,payout_paise:15000}])).rows[0].r;
 assert.equal(created.amount_paise,15000);
 const settlement=await one('SELECT status,amount_paise,lines FROM preview_settlements WHERE id=$1',[created.id]);
 assert.equal(settlement.status,'pending');assert.equal(settlement.lines[0].payout_paise,15000);
 assert.deepEqual(await one('SELECT settlement_id,creator_payout_paise FROM preview_order_items WHERE id=$1',[creatorLine]),{settlement_id:created.id,creator_payout_paise:15000});
 await assert.rejects(create([{order_item_id:creatorLine,payout_paise:15000}]),/already_settled/);
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','UPI-REF-123')",[created.id]),/invalid_settlement_transition/);
 await db.query('SELECT preview_approve_settlement($1)',[created.id]);
 await assert.rejects(db.query('SELECT preview_approve_settlement($1)',[created.id]),/invalid_settlement_transition/);
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','x')",[created.id]),/payment_reference_required/);
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,(now()+interval '3 days')::date,'UPI-REF-123')",[created.id]),/invalid_payment_date/);
 await db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','UPI-REF-123')",[created.id]);
 const paid=await one('SELECT status,paid_on::text AS paid_on,payment_reference,approved_at IS NOT NULL AS approved,paid_at IS NOT NULL AS stamped FROM preview_settlements WHERE id=$1',[created.id]);
 assert.deepEqual(paid,{status:'paid',paid_on:'2026-10-18',payment_reference:'UPI-REF-123',approved:true,stamped:true});
 await assert.rejects(db.query("SELECT preview_mark_settlement_paid($1,'2026-10-18','UPI-REF-123')",[created.id]),/invalid_settlement_transition/);
 assert.deepEqual((await db.query("SELECT action FROM preview_audit_events WHERE entity_id=$1 ORDER BY created_at,action",[created.id])).rows.map(r=>r.action).sort(),['settlement.approved','settlement.created','settlement.paid']);
});
test('public reads see only published, active creator profile columns; email and pickup addresses stay private',async()=>{
 await db.query("INSERT INTO preview_creator_pickup_addresses(creator_id,pickup_name,phone,address,pincode,shiprocket_location) VALUES($1,'Fictional Maker','9000000000','Fictional workshop, Testpur','560001','FICTIONAL_1')",[creatorId]);
 await assert.rejects(db.query("INSERT INTO preview_creator_pickup_addresses(creator_id,pickup_name,phone,address,pincode) VALUES($1,'X Y','123','Fictional workshop, Testpur','560001')",[otherCreator]),/phone_check/);
 await db.exec('SET ROLE anon');
 try {
  const rows=(await db.query('SELECT id,display_name,bio,photo_url,profession FROM preview_creators')).rows;
  assert.deepEqual(rows,[{id:creatorId,display_name:'Fictional Maker',bio:'Fictional story',photo_url:'https://example.invalid/photo.jpg',profession:'Staff nurse'}]);
  for(const sql of ['SELECT email FROM preview_creators','SELECT * FROM preview_creators','SELECT commission_bps FROM preview_creators','SELECT * FROM preview_creator_pickup_addresses','SELECT * FROM preview_invoice_counters','SELECT preview_mark_settlement_paid(gen_random_uuid(),current_date,\'UPI-REF-1\')','SELECT preview_create_creator_settlement(gen_random_uuid(),current_date,current_date,\'[]\',\'\')']) await assert.rejects(db.query(sql),/permission denied/,sql);
  await assert.rejects(db.query("UPDATE preview_creators SET bio='x'"),/permission denied/);
 } finally { await db.exec('RESET ROLE'); }
});
test('production and preview sections are identical apart from the preview_ prefix and the preview-only live-payment guard',()=>{
 const production=phaseB.slice(phaseB.indexOf('-- PRODUCTION SECTION (public.*)'),phaseB.indexOf('-- PREVIEW SECTION (public.preview_*)'));
 const normalize=s=>s.split('\n').filter(line=>!line.startsWith('-- ')&&!line.includes('preview_rejects_live_payment')).join('\n').replace(/preview_/g,'').trim();
 assert.equal(normalize(section(phaseB)),normalize(production));
 assert.doesNotMatch(production,/preview_/);assert.match(production,/catalog_only/);
});
test.after(async()=>db.close());
