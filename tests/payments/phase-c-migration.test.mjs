import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {buildCheckoutSnapshot,parseCheckoutRequest,stateName} from '../../src/lib/checkout-contract.ts';
import {orderPayoutLines,payoutConfig} from '../../src/lib/creator-payouts.ts';
import {buildInvoice,sellerFromEnv} from '../../src/lib/tax-invoice.ts';
// Runs the PREPARED phase C migration against disposable local Postgres (PGlite); never contacts any real database.
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const production=await read('../../supabase/commerce/checkout-phase-c.production.sql');
const preview=await read('../../supabase/commerce/checkout-phase-c.preview.sql');
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
for(const path of ['../../supabase/migrations/20261016090236_commerce_preview_schema.sql','../../supabase/commerce/payment-supplement.preview.sql','../../docs/commerce/creator-functions.sql','../../supabase/commerce/checkout-phase-a.preview.sql','../../supabase/commerce/checkout-phase-b.preview.sql']) await db.exec(await read(path));
const legacyItemCount=(await db.query('SELECT count(*)::int AS n FROM preview_order_items')).rows[0].n;
await db.exec(preview);
await db.exec(preview); // re-runnable
const one=async(sql,params)=>(await db.query(sql,params)).rows[0];

const makerA='40000000-0000-4000-8000-0000000000c1', makerB='40000000-0000-4000-8000-0000000000c2';
await db.query(`INSERT INTO preview_creators(id,email,display_name,status,commission_bps) VALUES($1,'a@example.invalid','Fictional Maker A','active',0),($2,'b@example.invalid','Fictional Maker B','active',0)`,[makerA,makerB]);
let seq=0;
const uuid=(prefix)=>`${prefix}-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
async function product({price,stock,creator=null,commerce={},active=true}){
 const id=uuid('10000000');
 await db.query('INSERT INTO preview_products(id,name,price,stock,is_active,commerce,slug,creator_id,image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,`Fictional item ${seq}`,price,stock,active,{storefronts:['general'],...commerce},`phase-c-${seq}`,creator,'https://example.invalid/item.jpg']);
 await db.query("INSERT INTO preview_product_operations(product_id,details) VALUES($1,'{\"license_status\":\"owned\"}')",[id]);
 return id;
}
const productRow=id=>one('SELECT id,name,price,stock,is_active,commerce,creator_id FROM preview_products WHERE id=$1',[id]);
const customer={customerName:'Fictional Buyer',customerEmail:'buyer@example.invalid',customerPhone:'9876543210',addressLine1:'1 Fictional Street',city:'Testpur',stateCode:'29',pincode:'560001',acceptTerms:true};
async function buyCombo({combo,components,quantity=1,extra=[]}){
 const products=await Promise.all([combo,...components,...extra.map(e=>e.productId)].map(productRow));
 const request=parseCheckoutRequest({items:[{productId:combo,quantity},...extra],...customer});
 const snapshot=buildCheckoutSnapshot(request,products,null,Date.now(),[{id:makerA,status:'active',commission_bps:0},{id:makerB,status:'active',commission_bps:0}],{sellerStateCode:'29',gstRegistered:true});
 const id=uuid('20000000');const n=seq;
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,gift_charge,shipping_charge,discount_amount,total_amount,is_test,customer,tax_breakdown) VALUES($1,$2,'general',$3,$4,$5,$6,$7,$8,true,$9,$10)`,
  [id,`order_c${n}`,JSON.stringify(snapshot.lines),snapshot.subtotal,snapshot.giftCharge,snapshot.shippingCharge,snapshot.discountAmount,snapshot.totalAmount,{...request.customer},snapshot.taxBreakdown]);
 const result=(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS r',[id,`pay_c${n}`,`order_c${n}`,snapshot.totalAmount,'INR',true,null])).rows[0].r;
 return {...result,snapshot};
}
async function comboFixture({stockA=5,stockB=3,qtyA=1,qtyB=2}={}){
 const a=await product({price:30000,stock:stockA,creator:makerA,commerce:{hsn:'6912',gst_rate_bps:1200}});
 const b=await product({price:10000,stock:stockB,creator:makerB,commerce:{hsn:'4202',gst_rate_bps:500}});
 const combo=await product({price:45000,stock:0,commerce:{combo:{components:[{product_id:a,quantity:qtyA},{product_id:b,quantity:qtyB}]}}});
 return {a,b,combo};
}

test('combo purchase decrements component stock atomically, never the combo itself, and records the components',async()=>{
 const f=await comboFixture();
 const r=await buyCombo({combo:f.combo,components:[f.a,f.b]});
 assert.equal(r.status,'confirmed');
 assert.deepEqual([(await productRow(f.a)).stock,(await productRow(f.b)).stock,(await productRow(f.combo)).stock],[4,1,0]);
 const items=(await db.query('SELECT line_index,combo_role,combo_parent_line,product_id,quantity,unit_price,creator_id FROM preview_order_items WHERE order_id=$1 ORDER BY line_index',[r.order_id])).rows;
 assert.deepEqual(items.map(i=>[i.line_index,i.combo_role,i.combo_parent_line,i.quantity,i.unit_price]),[[0,'combo',null,1,45000],[1,'component',0,1,0],[2,'component',0,2,0]]);
 assert.deepEqual(items.map(i=>i.creator_id),[null,makerA,makerB]);
 // A single combo counts as one item for shipping (₹49), whatever it contains.
 assert.equal(r.snapshot.shippingCharge,4900);
 assert.equal((await one('SELECT shipping_amount,total_amount FROM preview_orders WHERE id=$1',[r.order_id])).total_amount,45000+4900);
 assert.equal(legacyItemCount,0);
});
test('a combo is unavailable when any component runs short; nothing is decremented',async()=>{
 const f=await comboFixture({stockB:3});
 await buyCombo({combo:f.combo,components:[f.a,f.b]}); // b: 3 → 1
 const short=await Promise.all([f.combo,f.a,f.b].map(productRow)); // b has 1 left; one combo needs 2
 assert.throws(()=>buildCheckoutSnapshot(parseCheckoutRequest({items:[{productId:f.combo,quantity:1}],...customer}),short,null,Date.now(),[{id:makerA,status:'active',commission_bps:0},{id:makerB,status:'active',commission_bps:0}]),/Not enough stock for Fictional item/);
 // Race: the snapshot was valid but stock moved before payment — finalization refuses and keeps stock intact.
 await db.query('UPDATE preview_products SET stock=10 WHERE id=$1',[f.b]);
 const products=await Promise.all([f.combo,f.a,f.b].map(productRow));
 const snapshot=buildCheckoutSnapshot(parseCheckoutRequest({items:[{productId:f.combo,quantity:2}],...customer}),products,null,Date.now(),[{id:makerA,status:'active',commission_bps:0},{id:makerB,status:'active',commission_bps:0}],{sellerStateCode:'29'});
 await db.query('UPDATE preview_products SET stock=3 WHERE id=$1',[f.b]);
 const id=uuid('20000000');
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,shipping_charge,total_amount,is_test,customer,tax_breakdown) VALUES($1,'order_race','general',$2,$3,$4,$5,true,$6,$7)`,[id,JSON.stringify(snapshot.lines),snapshot.subtotal,snapshot.shippingCharge,snapshot.totalAmount,{name:'Fictional Buyer',email:'b@example.invalid',phone:'9876543210',address:'Fictional address, Testpur'},snapshot.taxBreakdown]);
 const result=(await db.query('SELECT preview_finalize_checkout_payment($1,$2,$3,$4,$5,$6,$7) AS r',[id,'pay_race','order_race',snapshot.totalAmount,'INR',true,null])).rows[0].r;
 assert.equal(result.status,'reconciliation_required');assert.equal(result.reason,'inventory_unavailable');
 assert.deepEqual([(await productRow(f.a)).stock,(await productRow(f.b)).stock],[4,3]);
});
test('cancelling or refunding a combo before shipment restores the component stock only',async()=>{
 const f=await comboFixture();
 const r=await buyCombo({combo:f.combo,components:[f.a,f.b],quantity:1});
 await db.query('SELECT preview_cancel_paid_order($1)',[r.order_id]);
 assert.deepEqual([(await productRow(f.a)).stock,(await productRow(f.b)).stock,(await productRow(f.combo)).stock],[5,3,0]);
 const g=await comboFixture();
 const s=await buyCombo({combo:g.combo,components:[g.a,g.b],quantity:1});
 await db.query('SELECT preview_refund_order($1)',[s.order_id]);
 assert.deepEqual([(await productRow(g.a)).stock,(await productRow(g.b)).stock,(await productRow(g.combo)).stock],[5,3,0]);
});
test('combo tax uses component GST rates; invoice lists components and reconciles; each component creator is paid their share',async()=>{
 const f=await comboFixture();
 const r=await buyCombo({combo:f.combo,components:[f.a,f.b]});
 const order=await one('SELECT * FROM preview_orders WHERE id=$1',[r.order_id]);
 const lines=order.tax_breakdown.lines;
 // 45000 split by unit price × quantity: 30000 : 2×10000 → 27000 / 18000.
 assert.deepEqual(lines.map(l=>[l.gross,l.gst_rate_bps]),[[0,null],[27000,1200],[18000,500]]);
 assert.equal(order.tax_breakdown.complete,true);
 const items=(await db.query('SELECT line_index,quantity,product_name,variant_name,combo_role,combo_parent_line FROM preview_order_items WHERE order_id=$1',[r.order_id])).rows;
 const invoice=buildInvoice({...order,created_at:new Date(order.created_at).toISOString(),invoice_date:new Date(order.invoice_date).toISOString()},items,sellerFromEnv({SELLER_LEGAL_NAME:'Fictional Trader',SELLER_ADDRESS:'Fictional address',SELLER_GSTIN:'29ABCDE1234F1Z5'}),stateName);
 assert.equal(invoice.reconciled,true);assert.equal(invoice.totals.total,order.total_amount);
 assert.deepEqual(invoice.rows.filter(row=>row.quantity!==null).map(row=>[row.rate_bps,row.hsn]),[[1200,'6912'],[500,'4202']]);
 assert.match(invoice.rows[0].description,/— in Fictional item/);
 await db.query('UPDATE preview_orders SET courier_cost_paise=6000 WHERE id=$1',[r.order_id]);
 const fresh=await one('SELECT id,status,created_at,courier_cost_paise,tax_breakdown FROM preview_orders WHERE id=$1',[r.order_id]);
 const rows=(await db.query('SELECT id,order_id,creator_id,line_index,quantity,product_name FROM preview_order_items WHERE order_id=$1',[r.order_id])).rows;
 const payouts=orderPayoutLines({...fresh,created_at:new Date(fresh.created_at).toISOString()},rows,payoutConfig({}));
 assert.equal(payouts.length,2);
 for(const payout of payouts){
  const row=rows.find(x=>x.id===payout.order_item_id);
  assert.equal((await one('SELECT preview_creator_line_payout($1,$2,236,0) AS p',[r.order_id,row.line_index])).p,payout.payout_paise);
 }
 const byCreator=Object.fromEntries(payouts.map(p=>[rows.find(x=>x.id===p.order_item_id).creator_id,p]));
 assert.equal(byCreator[makerA].line_value,27000);assert.equal(byCreator[makerB].line_value,18000);
});

// ─── creator self-service ───────────────────────────────────────────────────
const save=(creator,productId,fields,price=null)=>db.query('SELECT preview_creator_save_product($1,$2,$3,$4) AS r',[creator,productId,JSON.stringify(fields),price]);
test('a creator creates an unpublished, unpriced draft; owner-only fields in the input are ignored',async()=>{
 const r=(await save(makerA,null,{name:'Fictional pouch',description:'Hand-stitched',short_description:'Small pouch',materials:'Cotton',dimensions:'10 × 8 cm',preparation_days:3,media:[{url:'https://example.invalid/p.jpg',type:'image',alt:'Pouch'}],price:1,is_active:true,storefronts:['christmas'],catalog_only:false,hsn:'1234',gst_rate_bps:0,combo:{components:[]},commission_bps:10000,creator_id:makerB},45000)).rows[0].r;
 assert.equal(r.mode,'draft_created');
 const p=await productRow(r.product_id);
 assert.deepEqual([p.name,p.price,p.is_active,p.creator_id,p.stock],['Fictional pouch',0,false,makerA,0]);
 assert.deepEqual(p.commerce.storefronts,['general']);
 for(const key of ['hsn','gst_rate_bps','combo','catalog_only','commission_bps','price']) assert.equal(key in p.commerce,false,key);
 assert.equal(p.commerce.preparation_days,3);assert.equal(p.commerce.media[0].url,'https://example.invalid/p.jpg');
 assert.equal((await one('SELECT details FROM preview_product_operations WHERE product_id=$1',[r.product_id])).details.proposed_price_rupees,450);
 assert.equal((await one("SELECT count(*)::int AS n FROM preview_audit_events WHERE action='creator.product_draft_created' AND entity_id=$1",[r.product_id])).n,1);
 // Editing the draft applies directly (it is not public).
 assert.equal((await save(makerA,r.product_id,{name:'Fictional pouch v2',preparation_days:5})).rows[0].r.mode,'draft_updated');
 const edited=await productRow(r.product_id);assert.equal(edited.name,'Fictional pouch v2');assert.equal(edited.commerce.preparation_days,5);assert.equal(edited.price,0);
});
test('creators can never touch another creator’s product, and malformed fields are rejected',async()=>{
 const theirs=await product({price:20000,stock:2,creator:makerB});
 const ownerOnly=await product({price:20000,stock:2});
 for(const id of [theirs,ownerOnly,'10000000-0000-4000-8000-999999999999']) await assert.rejects(save(makerA,id,{name:'Taken over'}),/not_your_product/);
 assert.equal((await productRow(theirs)).name.startsWith('Fictional item'),true);
 for(const fields of [{name:'x'},{media:[{url:'http://example.invalid/a.jpg',type:'image'}]},{media:[{url:'https://example.invalid/a.exe',type:'file'}]},{preparation_days:1.5},{description:42}]) await assert.rejects(save(makerA,null,fields),/invalid_creator_fields/,JSON.stringify(fields));
 await assert.rejects(save(makerA,null,{name:'Fine name'},50),/invalid_proposed_price/);
 await db.query("UPDATE preview_creators SET status='suspended' WHERE id=$1",[makerB]);
 await assert.rejects(save(makerB,theirs,{name:'Suspended edit'}),/creator_not_active/);
 await db.query("UPDATE preview_creators SET status='active' WHERE id=$1",[makerB]);
});
test('edits to a live product wait as one pending revision; the owner approves in one tap without changing price or publishing',async()=>{
 const live=await product({price:20000,stock:4,creator:makerA,commerce:{storefronts:['general','christmas'],hsn:'6912',gst_rate_bps:1200}});
 const before=await productRow(live);
 const first=(await save(makerA,live,{name:'Fictional live v2',short_description:'New words',price:1},30000)).rows[0].r;
 assert.equal(first.mode,'revision_pending');
 assert.deepEqual(await productRow(live),before); // the live listing is untouched
 const second=(await save(makerA,live,{name:'Fictional live v3',dimensions:'5 cm'},32000)).rows[0].r;
 assert.equal(second.submission_id,first.submission_id);
 assert.equal((await one("SELECT count(*)::int AS n FROM preview_creator_submissions WHERE product_id=$1 AND status='submitted'",[live])).n,1);
 // The original new-product review function cannot approve a revision.
 await assert.rejects(db.query("SELECT preview_review_creator_submission($1,'approved',20000,'')",[first.submission_id]),/Existing product edits/);
 await db.query("SELECT preview_review_creator_revision($1,'approved','Looks good')",[first.submission_id]);
 const after=await productRow(live);
 assert.deepEqual([after.name,after.price,after.is_active,after.stock],['Fictional live v3',20000,true,4]);
 assert.deepEqual(after.commerce.storefronts,['general','christmas']);assert.equal(after.commerce.gst_rate_bps,1200);assert.equal(after.commerce.dimensions,'5 cm');
 assert.equal(after.commerce.short_description,'New words'); // earlier pending fields are kept when a later edit is merged
 assert.deepEqual(Object.keys((await one('SELECT details FROM preview_creator_submissions WHERE id=$1',[first.submission_id])).details).sort(),['dimensions','name','short_description'])
 assert.equal((await one('SELECT details FROM preview_product_operations WHERE product_id=$1',[live])).details.proposed_price_rupees,320);
 await assert.rejects(db.query("SELECT preview_review_creator_revision($1,'approved','')",[first.submission_id]),/revision_unavailable/);
 const rejected=(await save(makerA,live,{name:'Fictional live v4'})).rows[0].r;
 await db.query("SELECT preview_review_creator_revision($1,'rejected','Not this time')",[rejected.submission_id]);
 assert.equal((await productRow(live)).name,'Fictional live v3');
 assert.deepEqual((await db.query("SELECT action FROM preview_audit_events WHERE entity_id IN ($1,$2) ORDER BY created_at",[first.submission_id,rejected.submission_id])).rows.map(r=>r.action).filter(a=>a.startsWith('revision.')||a==='creator.revision_submitted').sort(),['creator.revision_submitted','creator.revision_submitted','creator.revision_submitted','revision.approved','revision.rejected']);
 await db.query("UPDATE preview_products SET commerce=commerce||'{\"archived\":true}' WHERE id=$1",[live]);
 await assert.rejects(save(makerA,live,{name:'After archive'}),/product_archived/);
});
test('anonymous role cannot call creator or combo functions',async()=>{
 await db.exec('SET ROLE anon');
 try {
  for(const sql of ["SELECT preview_creator_save_product(gen_random_uuid(),NULL,'{}',NULL)","SELECT preview_review_creator_revision(gen_random_uuid(),'approved','')","SELECT preview_close_unshipped_order(gen_random_uuid(),'cancelled')"]) await assert.rejects(db.query(sql),/permission denied/,sql);
 } finally { await db.exec('RESET ROLE'); }
});
const code=s=>s.replace(/\r/g,'').split('\n').filter(line=>!line.startsWith('--')).join('\n');
test('production and preview files are identical apart from the preview_ prefix and the preview-only live-payment guard',()=>{
 const normalize=s=>code(s).split('\n').filter(line=>!line.includes('preview_rejects_live_payment')).join('\n').replace(/preview_/g,'').trim();
 assert.equal(normalize(preview),normalize(production));
 assert.doesNotMatch(code(production),/preview_/);assert.match(code(production),/catalog_only/);
 assert.match(production,/PRODUCTION ONLY/);assert.match(preview,/PREVIEW ONLY/);
 assert.equal((code(production).match(/^BEGIN;$/gm)??[]).length,1);assert.equal((code(preview).match(/^BEGIN;$/gm)??[]).length,1);
});
test.after(async()=>db.close());
