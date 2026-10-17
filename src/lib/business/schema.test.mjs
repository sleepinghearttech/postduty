import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Execute the dashboard's real projections against disposable local PostgreSQL.
// This adapter implements only the query-builder methods used by data.ts; it
// never connects to Supabase, reads environment credentials or changes live data.
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
const db=new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
await db.exec(await readFile(new URL('../../../supabase/migrations/20261016090236_commerce_preview_schema.sql',import.meta.url),'utf8'));
const traces=[];
let owner=true;
class Query {
  constructor(table){this.table=table;this.columns='*';this.conditions=[];this.values=[];this.options={};this.max=undefined;}
  select(columns,options={}){this.columns=columns;this.options=options;return this;}
  limit(max){this.max=max;return this;}
  gte(column,value){return this.filter(column,'>=',value);}
  lt(column,value){return this.filter(column,'<',value);}
  eq(column,value){return this.filter(column,'=',value);}
  is(column){this.conditions.push(`"${column}" IS NULL`);return this;}
  filter(column,operator,value){this.values.push(value);this.conditions.push(`"${column}" ${operator} $${this.values.length}`);return this;}
  in(column,values){this.values.push(values);this.conditions.push(`"${column}" = ANY($${this.values.length}${column==='status'?'::text[]':'::uuid[]'})`);return this;}
  async run(){
    const selection=this.columns.split(',').map(entry=>{const parts=entry.split(':');return parts.length===2?`"${parts[1]}" AS "${parts[0]}"`:`"${entry}"`;}).join(',');
    const where=this.conditions.length?' WHERE '+this.conditions.join(' AND '):'';
    try {
      const result=this.options.head?{rows:[]}:await db.query(`SELECT ${selection} FROM public."${this.table}"${where}${this.max===undefined?'':` LIMIT ${this.max}`}`,this.values);
      const count=this.options.count?(await db.query(`SELECT COUNT(*)::int AS n FROM public."${this.table}"${where}`,this.values)).rows[0].n:null;
      const rows=JSON.parse(JSON.stringify(result.rows));
      traces.push({table:this.table,columns:this.columns,rows,ok:true});
      return {data:rows,count,error:null};
    } catch(error){traces.push({table:this.table,columns:this.columns,code:error.code,ok:false});return {data:null,count:null,error:{code:error.code,message:error.message}};}
  }
  then(resolve,reject){return this.run().then(resolve,reject);}
}
async function loadTs(name,imports={}){
  const source=await readFile(new URL(`./${name}.ts`,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const testModule={exports:{}};
  new Function('require','module','exports',code)((id)=>{if(id in imports)return imports[id];throw new Error(`Unexpected import ${id}`);},testModule,testModule.exports);
  return testModule.exports;
}
const metrics=await loadTs('metrics');const queries=await loadTs('queries');
const attention=await loadTs('attention');
const {loadBusiness}=await loadTs('data',{'server-only':{},'@/lib/supabase':{supabaseAdmin:{from:(table)=>new Query(table)}},'@/lib/commerce-db':{commerceTable:name=>`preview_${name}`,isCommerceSandbox:()=>true},'@/lib/commerce-auth':{requireOwner:async()=>owner},'./metrics':metrics,'./queries':queries,'./attention':attention});
const creator='10000000-0000-4000-8000-000000000001';const product='20000000-0000-4000-8000-000000000001';const order='30000000-0000-4000-8000-000000000001';const intent='40000000-0000-4000-8000-000000000001';
await db.query("INSERT INTO preview_creators(id,email,display_name,status) VALUES($1,'fixture@example.invalid','Fictional Creator','active')",[creator]);
await db.query("INSERT INTO preview_products(id,name,slug,price,stock,is_active,creator_id,commerce) VALUES($1,'Current product title','fictional-fixture',10000,2,true,$2,'{\"category\":\"Crochet\",\"storefronts\":[\"christmas\"]}')",[product,creator]);
await db.query("INSERT INTO preview_orders(id,customer_name,customer_email,customer_phone,shipping_address,total_amount,status,storefront,is_test,created_at) VALUES($1,'Fictional Buyer','buyer@example.invalid','9999999999','Fictional address',10000,'paid','christmas',true,'2026-10-16T05:00:00Z')",[order]);
await db.query("INSERT INTO preview_order_items(order_id,product_id,quantity,unit_price,creator_id,fulfillment_status,created_at) VALUES($1,$2,1,10000,$3,'awaiting_acceptance','2026-10-16T05:00:00Z')",[order,product,creator]);
const range=metrics.businessRange('2026-10-16','2026-10-16',new Date('2026-10-16T10:00:00Z'));

test('base schema fallback preserves storefront, explicit mode boolean, creator and fulfillment fields',async()=>{
  const result=await loadBusiness(range);
  const orders=traces.findLast(t=>t.table==='preview_orders'&&t.ok&&t.rows.length).rows;
  const items=traces.findLast(t=>t.table==='preview_order_items'&&t.ok&&t.rows[0]?.quantity).rows;
  assert.equal(orders[0].storefront,'christmas');assert.equal(orders[0].is_test,true);
  assert.equal(items[0].creator_id,creator);assert.equal(items[0].fulfillment_status,'awaiting_acceptance');
  assert.equal(result.awaitingAcceptance,1);assert.equal(result.financialAvailable,false);
  assert.equal(result.attentionAvailable,false,'Missing payment tables must not be shown as a clear queue');
  assert.equal(result.summary.revenue,0);assert.equal(result.summary.unverifiedCount,1);
  assert.equal(traces.filter(t=>t.table==='preview_orders'&&!t.ok).at(-1).code,'42703');
});
test('full supplement projections execute without fallback and match immutable capture evidence',async()=>{
  await db.exec(await readFile(new URL('../../../supabase/commerce/payment-supplement.preview.sql',import.meta.url),'utf8'));
  await db.query("UPDATE preview_orders SET payment_mode='test' WHERE id=$1",[order]);
  await db.query("UPDATE preview_order_items SET product_name='Original product title',earnings_creator_id=$1,earnings_review_required=false,line_discount_amount=0,commission_amount=1000,creator_earning_paise=9000 WHERE order_id=$2",[creator,order]);
  await db.query("INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,total_amount,is_test) VALUES($1,'order_fixture','christmas',$2,10000,10000,true)",[intent,[{product_id:product,quantity:1,unit_price:10000}]]);
  // Deliberately captured before the reporting window: order-linked proof must still count.
  await db.query("INSERT INTO preview_checkout_payments(provider_payment_id,provider_order_id,intent_id,order_id,amount,currency,is_test,provider_verified_at) VALUES('pay_fixture','order_fixture',$1,$2,10000,'INR',true,'2026-10-10T05:00:00Z')",[intent,order]);
  traces.length=0;
  const result=await loadBusiness(range);
  assert.deepEqual(result.warnings,[]);assert.equal(result.financialAvailable,true);
  assert.equal(result.summary.revenue,10000);assert.equal(result.summary.paidCount,1);assert.equal(result.summary.unverifiedCount,0);
  assert.equal(result.summary.ranks[0].name,'Original product title');
  assert.equal(result.summary.creatorRanks[0].creator_id,creator);
  assert.equal(result.summary.storefronts.find(s=>s.storefront==='christmas').revenue,10000);
  assert.equal(traces.some(t=>!t.ok),false,'Every actual dashboard projection must succeed against the full schema');
});
test('mode proof survives absent optional payment_mode but mismatching explicit modes fail closed',()=>{
  const base={id:order,created_at:'2026-10-16T05:00:00Z',total_amount:10000,status:'paid',is_test:true,storefront:'christmas'};
  const payment={order_id:order,status:'captured',amount:10000,currency:'INR',is_test:true,provider_verified_at:'2026-10-16T05:00:00Z'};
  assert.equal(metrics.verifiedMode(base,[payment]),'test');assert.equal(metrics.verifiedMode({...base,payment_mode:'live'},[payment]),'unknown');
  assert.equal(metrics.verifiedMode({...base,is_test:false},[payment]),'unknown');
  assert.equal(metrics.verifiedMode({...base,is_test:false},[]),'unknown');
});
test('attention queue exposes unresolved captures, separate checkouts and notification failures with modes but no raw error PII',async()=>{
  const orphan='40000000-0000-4000-8000-000000000002';const waiting='40000000-0000-4000-8000-000000000003';const liveOrder='30000000-0000-4000-8000-000000000002';
  await db.query("INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,total_amount,is_test,status,reconciliation_reason) VALUES($1,'order_orphan','christmas',$2,5000,5000,true,'reconciliation_required','inventory_unavailable')",[orphan,[{product_id:product,quantity:1,unit_price:5000}]]);
  await db.query("INSERT INTO preview_checkout_payments(provider_payment_id,provider_order_id,intent_id,amount,currency,is_test,reason) VALUES('pay_orphan','order_orphan',$1,5000,'INR',true,'private buyer@example.invalid detail')",[orphan]);
  await db.query("INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,total_amount,is_test,status,reconciliation_reason) VALUES($1,'order_waiting','general',$2,5000,5000,false,'awaiting_customer','customer_details_required')",[waiting,[{product_id:product,quantity:1,unit_price:5000}]]);
  await db.query("INSERT INTO preview_orders(id,customer_name,customer_email,customer_phone,shipping_address,total_amount,status,storefront,is_test,payment_mode) VALUES($1,'Fictional Buyer','buyer@example.invalid','9999999999','Fictional address',10000,'paid','general',false,'live')",[liveOrder]);
  await db.query("INSERT INTO preview_payment_notification_jobs(order_id,status) VALUES($1,'failed'),($2,'attempted_unconfirmed')",[order,liveOrder]);
  const result=await loadBusiness(range);
  assert.equal(result.attentionAvailable,true);assert.equal(result.attention.length,4);
  assert.equal(result.attention.filter(row=>row.kind==='payment').length,1,'Capture and its flagged intent are one issue');
  assert.equal(result.attention.find(row=>row.kind==='payment').mode,'test');
  assert.equal(result.attention.find(row=>row.kind==='checkout').mode,'live');
  assert.equal(result.attention.find(row=>row.reference===liveOrder).mode,'live');
  assert.equal(result.attention.find(row=>row.reference===order).mode,'test');
  assert.equal(JSON.stringify(result.attention).includes('buyer@example.invalid'),false);
  assert.equal(result.summary.revenue,10000,'Unattached capture is not recognized as order receipts');
});
test('creator sales use original attribution, preserving distinct creators for the same product',()=>{
  const original='original';const other='other';
  const paid={id:order,created_at:'2026-10-16T05:00:00Z',total_amount:30000,status:'paid',is_test:true};
  const proof={order_id:order,status:'captured',amount:30000,currency:'INR',is_test:true,provider_verified_at:'2026-10-16T05:00:00Z'};
  const common={order_id:order,product_id:product,quantity:1,unit_price:10000};
  const summary=metrics.summarizeBusiness([paid],[{...common,id:'one',creator_id:other,earnings_creator_id:original,earnings_review_required:true},{...common,id:'two',creator_id:other,earnings_creator_id:other},{...common,id:'legacy',creator_id:other}], [proof],[],range,'test');
  assert.equal(summary.creatorRanks.find(r=>r.creator_id===original).gross,10000);
  assert.equal(summary.creatorRanks.find(r=>r.creator_id===original).reviewItems,1);
  assert.equal(summary.creatorRanks.find(r=>r.creator_id===other).gross,10000);
  assert.equal(summary.creatorRanks.find(r=>r.attribution==='unknown').gross,10000);
});
test('permission or missing-table errors do not trigger schema fallback; authorization precedes all reads',async()=>{
  assert.equal(queries.missingColumn({code:'42501'}),false);assert.equal(queries.missingColumn({code:'42P01'}),false);assert.equal(queries.missingColumn({code:'PGRST204'}),true);
  owner=false;traces.length=0;
  await assert.rejects(loadBusiness(range),/Unauthorized/);assert.equal(traces.length,0);owner=true;
});
test.after(async()=>{await db.close();});
