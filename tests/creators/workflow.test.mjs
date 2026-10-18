import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
for(const path of ['../../supabase/migrations/20261016090236_commerce_preview_schema.sql','../../supabase/commerce/payment-supplement.preview.sql','../../docs/commerce/creator-functions.sql']) await db.exec(readFileSync(new URL(path,import.meta.url),'utf8'));
const users=new Map();
function identifier(value){assert.match(value,/^[a-z_]+$/);return `"${value}"`;}
const client={auth:{async getUser(token){return{data:{user:users.get(token)||null},error:null};}},async rpc(name,args){try{const values=Object.values(args);const result=await db.query(`SELECT ${identifier(name)}(${values.map((_,i)=>'$'+(i+1)).join(',')}) AS data`,values);return{data:result.rows[0].data,error:null};}catch(error){return{data:null,error};}},from(table){
 let kind='select',columns='*',body,filters=[],limit=1000,order=null,returning=false;
 const query={select(value='*'){columns=value;returning=kind!=='select';return query;},insert(value){kind='insert';body=value;return query;},update(value){kind='update';body=value;return query;},eq(column,value){filters.push([column,'=',value]);return query;},in(column,value){filters.push([column,'in',value]);return query;},is(column,value){filters.push([column,'is',value]);return query;},not(column,operator,value){assert.equal(operator,'is');assert.equal(value,null);filters.push([column,'is not',null]);return query;},order(column,{ascending}){order=[column,ascending];return query;},limit(value){limit=value;return query;},async maybeSingle(){const result=await run();return{...result,data:result.data?.[0]||null};},then(resolve,reject){return run().then(resolve,reject);}};
 async function run(){try{
  const params=[];const bind=value=>{params.push(value);return '$'+params.length;};
  const col=columns==='*'?'*':columns.split(',').map(identifier).join(',');let sql;
  if(kind==='insert'){const keys=Object.keys(body);sql=`INSERT INTO ${identifier(table)}(${keys.map(identifier).join(',')}) VALUES(${keys.map(key=>bind(body[key])).join(',')})`;}
  else if(kind==='update'){sql=`UPDATE ${identifier(table)} SET ${Object.entries(body).map(([key,value])=>`${identifier(key)}=${bind(value)}`).join(',')}`;}
  else sql=`SELECT ${col} FROM ${identifier(table)}`;
  if(filters.length)sql+=' WHERE '+filters.map(([column,op,value])=>op==='in'?`${identifier(column)} IN (${value.map(bind).join(',')})`:op.startsWith('is')?`${identifier(column)} ${op} NULL`:`${identifier(column)}=${bind(value)}`).join(' AND ');
  if(kind==='select'){if(order)sql+=` ORDER BY ${identifier(order[0])} ${order[1]?'ASC':'DESC'}`;sql+=` LIMIT ${Number(limit)}`;}
  if(returning)sql+=' RETURNING '+col;
  const result=await db.query(sql,params);return{data:result.rows,error:null};
 }catch(error){return{data:null,error};}}
 return query;
}};
const imports={'server-only':{},'@/lib/supabase':{supabaseAdmin:client},'@/lib/commerce-db':{commerceTable:name=>`preview_${name}`,isCommerceSandbox:()=>true},'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/commerce-auth':{requireOwner:async()=>true,isAllowedMutationOrigin:()=>true}};
function load(path){const output=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};vm.runInNewContext(output,{module,exports:module.exports,require:name=>{if(!(name in imports))throw new Error(`Missing ${name}`);return imports[name];},URL,TextEncoder,Uint8Array,crypto:globalThis.crypto,Date,Buffer});return module.exports;}
imports['@/lib/creator-types']=load('../../src/lib/creator-types.ts');
imports['@/lib/creator-auth']=load('../../src/lib/creator-auth.ts');
imports['@/lib/creator-data']=load('../../src/lib/creator-data.ts');
imports['@/lib/creator-profile']=load('../../src/lib/creator-profile.ts');
imports['@/lib/creator-payouts']=load('../../src/lib/creator-payouts.ts');
imports['@/lib/creator-statement']=load('../../src/lib/creator-statement.ts');
const submit=load('../../src/app/api/creator/submissions/route.ts');
const session=load('../../src/app/api/creator/session/route.ts');
const fulfillment=load('../../src/app/api/creator/fulfillment/route.ts');
const admin=load('../../src/app/api/admin/creators/route.ts');
const request=(token,body={})=>({headers:new Headers({authorization:`Bearer ${token}`,origin:'https://preview.example.invalid'}),nextUrl:{origin:'https://preview.example.invalid'},json:async()=>body});

test('fictional two-creator order moves from approved submissions through isolated fulfillment to manual settlement',async()=>{
 const creators=[];const products=[];
 for(let n=1;n<=2;n++){
  const id=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,userId=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,email=`maker${n}@example.invalid`,token=`fictional-token-${n}`;
  await db.query(`INSERT INTO preview_creators(id,email,display_name,commission_bps) VALUES($1,$2,$3,1000)`,[id,email,`Fictional Maker ${n}`]);
  await db.query(`INSERT INTO preview_creator_invites(creator_id,email,token_hash,expires_at) VALUES($1,$2,$3,'2099-01-01')`,[id,email,'a'.repeat(63)+n]);
  await db.query(`SELECT preview_redeem_creator_invitation($1,$2,$3)`,['a'.repeat(63)+n,userId,email]);
  users.set(token,{id:userId,email,email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'}});creators.push({id,token});
  const response=await submit.POST(request(token,{title:`Fictional ornament ${n}`,proposed_price_rupees:250,stock:2,storefronts:['christmas'],description:'Fictional QA fixture',media:[{url:'https://example.invalid/fixture.jpg',type:'image',alt:'Fictional'}]}));
  assert.equal(response.status,200);
  const approved=await admin.POST(request('owner',{action:'review_submission',id:response.body.id,status:'approved',price_rupees:300}));assert.equal(approved.status,200);
  const product=(await db.query('SELECT * FROM preview_products WHERE id=$1',[approved.body.product_id])).rows[0];assert.equal(product.is_active,false);
  await db.query(`SELECT preview_save_commerce_product($1,$2,'publish',NULL)`,[product,{license_status:'owned'}]);products.push(product);
 }
 const intent='30000000-0000-4000-8000-000000000001';const lines=products.map(product=>({product_id:product.id,product_name:product.name,quantity:1,unit_price:30000,creator_id:product.creator_id,commission_bps:1000,variant_id:null,personalization:'Fictional personalization'}));
 await db.query(`INSERT INTO preview_checkout_intents(id,provider_order_id,storefront,items,subtotal,total_amount,is_test,customer) VALUES($1,'order_fictional_creator','christmas',$2,60000,60000,true,$3)`,[intent,lines,{name:'Fictional Buyer',email:'buyer@example.invalid',phone:'0000000000',address:'Fictional QA address'}]);
 const paid=(await db.query(`SELECT preview_finalize_checkout_payment($1,'pay_fictional_creator','order_fictional_creator',60000,'INR',true,NULL) AS result`,[intent])).rows[0].result;assert.equal(paid.status,'confirmed');
 const items=(await db.query('SELECT * FROM preview_order_items WHERE order_id=$1 ORDER BY creator_id',[paid.order_id])).rows;assert.equal(items.length,2);
 for(let n=0;n<2;n++){
  const own=creators[n];const response=await session.GET(request(own.token));assert.equal(response.status,200);assert.equal(response.body.fulfillment.length,1);assert.equal(response.body.fulfillment[0].creator_id,own.id);
  const forbidden=await fulfillment.POST(request(own.token,{id:items[1-n].id,status:'accepted'}));assert.equal(forbidden.status,403);
  for(const status of ['accepted','preparing','ready','dispatched']){const update=await fulfillment.POST(request(own.token,{id:items[n].id,status,tracking_code:'FICTIONAL-TRACK',tracking_url:'https://example.invalid/track'}));assert.equal(update.status,200);}
  const settle=await admin.POST(request('owner',{action:'settlement_create',creator_id:own.id,amount_rupees:270,note:'Fictional verified order, 10% commission, no adjustment'}));assert.equal(settle.status,200);
  const ledger=(await db.query('SELECT * FROM preview_settlements WHERE creator_id=$1',[own.id])).rows[0];assert.equal(ledger.status,'pending');
  const approval=await admin.POST(request('owner',{action:'settlement_approve',id:ledger.id}));assert.equal(approval.status,200);
  const refreshed=await session.GET(request(own.token));assert.equal(refreshed.body.settlements.length,1);assert.equal(refreshed.body.settlements[0].status,'approved');assert.equal(refreshed.body.fulfillment[0].status,'dispatched');
 }
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_settlements WHERE status=\'paid\'')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_payment_notification_jobs WHERE status=\'suppressed_test\'')).rows[0].n,1);
});
