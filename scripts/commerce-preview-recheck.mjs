/**
 * Final version-preview verification. Run only with private environment variables:
 * PREVIEW_URL, ADMIN_SECRET, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
 *
 * This is NOT a fake successful-payment test. It reads an existing captured TEST
 * payment directly from Razorpay and replays its genuine signed callback twice.
 * Razorpay and Supabase requests are read-only. No catalog creation, new charge,
 * capture, refund, payout, customer message, deployment, or production mutation.
 * The only new record is a clearly fictional manual refund-service case in preview.
 */
import {createHmac, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const ORDER_ID='ebfcb382-af42-41a3-b9db-351917f65797';
const PRODUCT_ID='6589c5c8-e543-453e-81ec-f8d309bc2a29';
const reportPath=fileURLToPath(new URL('../docs/commerce/final-deployed-verification.json',import.meta.url));
const report={schema_version:1,started_at:new Date().toISOString(),status:'not_started',preview_url:null,fixtures:{order_id:ORDER_ID,product_id:PRODUCT_ID},tests:[],limitations:['API verification, not an Android visual usability review.','Replays a previously captured genuine provider TEST payment; creates no new charge and makes no provider mutations.','Notification suppression is verified in the application ledger; external delivery systems are not queried.','The refund case is a fictional manual service record, not evidence of a refund transfer.']};
let origin,dbOrigin,ownerCookie='',guardsPassed=false;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const same=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message);
function previewOrigin(value){
 let u;try{u=new URL(value);}catch{throw new Error('A valid PREVIEW_URL is required.');}
 check(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname==='/'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?-postduty\.jijo925\.workers\.dev$/.test(u.hostname),'Refusing non-version or production URL.');return u.origin;
}
async function request(url,options,label){
 try{return await fetch(url,{...options,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30000)});}catch{throw new Error(`${label}: network request failed; no automatic mutation retry.`);}
}
async function app(path,{method='GET',body,auth=false,foreign=false,html=false}={}){
 check(path.startsWith('/')&&!path.startsWith('//'),'Invalid preview path.');
 const headers={Accept:html?'text/html':'application/json'};
 if(auth){check(ownerCookie,'No owner session.');headers.Cookie=ownerCookie;}
 if(method!=='GET'){headers.Origin=foreign?'https://untrusted.example.invalid':origin;headers['Content-Type']='application/json';}
 const r=await request(origin+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})},'Preview API');
 let data;try{data=html?await r.text():await r.json();}catch{data=null;}
 return {status:r.status,headers:r.headers,data};
}
async function database(table,params={},count=false){
 check(/^(?:preview_(?:products|orders|order_items|checkout_payments|payment_notification_jobs|order_cases)|products|orders)$/.test(table),'Unexpected database table.');
 const url=new URL(`/rest/v1/${table}`,dbOrigin);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
 const r=await request(url,{method:count?'HEAD':'GET',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,...(count?{Prefer:'count=exact'}:{})}},'Read-only database');
 check(r.ok,'Read-only database query failed.');
 if(count){const n=r.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];check(n!==undefined,'Exact database count unavailable.');return Number(n);}
 const data=await r.json();check(Array.isArray(data),'Database returned an unexpected shape.');return data;
}
async function one(table,params){const rows=await database(table,params);check(rows.length===1,'Expected exactly one existing preview fixture.');return rows[0];}
async function counts(){const tables=['products','orders','preview_products','preview_orders','preview_order_items','preview_checkout_payments','preview_order_cases'];return Object.fromEntries(await Promise.all(tables.map(async t=>[t,await database(t,{select:'*'},true)])));}
async function snapshot(){
 const [order,product,items,payment,jobs,total]=await Promise.all([
  one('preview_orders',{select:'id,total_amount,status,razorpay_order_id,razorpay_payment_id,checkout_intent_id,is_test,payment_mode,created_at',id:`eq.${ORDER_ID}`}),
  one('preview_products',{select:'id,stock,price,commerce,updated_at',id:`eq.${PRODUCT_ID}`}),
  database('preview_order_items',{select:'id,order_id,product_id,quantity,unit_price,variant_id,fulfillment_status,commission_bps,creator_earning_paise',order_id:`eq.${ORDER_ID}`,order:'id.asc'}),
  one('preview_checkout_payments',{select:'provider_payment_id,provider_order_id,intent_id,order_id,amount,currency,status,is_test,provider_verified_at,reason',order_id:`eq.${ORDER_ID}`}),
  database('preview_payment_notification_jobs',{select:'order_id,status,created_at,attempted_at',order_id:`eq.${ORDER_ID}`,order:'order_id.asc'}),counts()]);
 return {order,product,items,payment,jobs,total};
}
async function provider(paymentId){
 check(/^pay_[A-Za-z0-9]+$/.test(paymentId),'Invalid existing provider payment reference.');
 const authorization=Buffer.from(`${process.env.RAZORPAY_KEY_ID.trim()}:${process.env.RAZORPAY_KEY_SECRET.trim()}`).toString('base64');
 const r=await request(`https://api.razorpay.com/v1/payments/${paymentId}`,{method:'GET',headers:{Authorization:`Basic ${authorization}`,Accept:'application/json'}},'Read-only provider');
 check(r.ok,'Existing provider TEST payment could not be retrieved.');const p=await r.json();
 check(p.id===paymentId&&p.status==='captured'&&p.captured===true&&p.currency==='INR'&&p.amount===34950&&p.amount_refunded===0,'The existing provider payment is not the expected captured, unrefunded INR TEST payment.');
 return {id:p.id,order_id:p.order_id,status:p.status,captured:p.captured,amount:p.amount,currency:p.currency,amount_refunded:p.amount_refunded};
}
async function verify(name,fn){try{await fn();report.tests.push({name,status:'passed'});console.log(`PASS ${name}`);}catch(error){report.tests.push({name,status:'failed'});throw error;}}
function requireStatus(r,status,message){check(r.status===status,`${message} (HTTP ${r.status}; expected ${status}).`);}
function privateResponse(r){check(/private/i.test(r.headers.get('cache-control')??'')&&/no-store/i.test(r.headers.get('cache-control')??''),'Protected API lacks private no-store caching.');}
function indiaDay(value){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const get=k=>parts.find(p=>p.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}
async function main(){
 origin=previewOrigin(process.env.PREVIEW_URL);report.preview_url=origin;
 for(const name of ['ADMIN_SECRET','SUPABASE_SERVICE_ROLE_KEY','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET'])check(process.env[name]?.trim(),`Missing private environment variable ${name}.`);
 check(/^rzp_test_[A-Za-z0-9]+$/.test(process.env.RAZORPAY_KEY_ID.trim()),'Refusing non-test provider credentials.');
 let db;try{db=new URL(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL);}catch{throw new Error('Missing valid Supabase URL.');}
 check(db.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(db.hostname)&&!db.port&&!db.username&&!db.password&&db.pathname==='/'&&!db.search&&!db.hash,'Invalid Supabase origin.');dbOrigin=db.origin;
 await verify('Version-preview noindex and fictional storefront notices',async()=>{
  for(const path of ['/christmas','/store']){const r=await app(path,{html:true});requireStatus(r,200,'Preview storefront unavailable');check(typeof r.data==='string'&&/fictional\s+(?:test\s+)?products/i.test(r.data)&&/preview/i.test(r.data),'Fictional preview notice absent; refusing mutations.');check((r.data.match(/<meta\b[^>]*>/gi)??[]).some(tag=>/\bname=["']robots["']/i.test(tag)&&/\bcontent=["'][^"']*\bnoindex\b/i.test(tag)),'Preview noindex absent; refusing mutations.');}
 });guardsPassed=true;
 let before,providerBefore;
 await verify('Existing verified test fixture and preserved source production baseline',async()=>{
  before=await snapshot();check(before.total.products===2&&before.total.orders===13,'Source production count differs from the approved 2 products / 13 orders baseline.');
  check(before.order.total_amount===34950&&before.order.status==='paid'&&before.order.is_test===true&&before.order.payment_mode==='test','Existing preview order is not the expected paid TEST fixture.');
  check(before.items.length===1&&before.items[0].product_id===PRODUCT_ID&&before.items[0].quantity===1&&before.items[0].unit_price===34950,'Existing preview item does not match the known crochet fixture.');
  check(before.payment.amount===34950&&before.payment.currency==='INR'&&before.payment.status==='captured'&&before.payment.is_test===true&&before.payment.provider_verified_at&&before.payment.reason===null,'Verified TEST capture ledger is missing.');
  check(before.payment.provider_order_id===before.order.razorpay_order_id&&before.payment.provider_payment_id===before.order.razorpay_payment_id&&before.payment.intent_id===before.order.checkout_intent_id,'Order and immutable capture references do not match.');
  check(before.jobs.length===1&&before.jobs[0].status==='suppressed_test'&&before.jobs[0].attempted_at===null,'Test notification job was not suppressed.');
  providerBefore=await provider(before.order.razorpay_payment_id);check(providerBefore.order_id===before.order.razorpay_order_id,'Provider order does not match the saved order.');
  report.baseline={counts:before.total,stock:before.product.stock,provider:{verified:true,status:providerBefore.status,amount_paise:providerBefore.amount,currency:providerBefore.currency,amount_refunded_paise:0}};
 });
 const caseId=randomUUID();const create={action:'create',id:caseId,order_id:ORDER_ID,kind:'refund',reason:'Fictional preview verification of manual refund service workflow',note:'QA only. No refund transfer, customer message, stock change or order status change is authorized.',amount_rupees:1};
 await verify('Unauthenticated owner routes and manual refund API are denied',async()=>{
  for(const path of ['/admin','/admin/products','/admin/orders','/admin/creators','/admin/analytics','/admin/research']){const r=await app(path,{html:true});check([302,303,307,308,401,403].includes(r.status),'An owner page was accessible without authentication.');}
  for(const path of ['/api/admin/analytics?mode=test','/api/admin/research',`/api/admin/order-cases?order_id=${ORDER_ID}`]){const r=await app(path);requireStatus(r,401,'An owner API was accessible without authentication');}
  requireStatus(await app('/api/admin/order-cases',{method:'POST',body:create}),401,'Unauthenticated manual refund creation was allowed');
 });
 await verify('Owner session and protected operation routes work',async()=>{
  const r=await app('/api/admin/login',{method:'POST',body:{password:process.env.ADMIN_SECRET}});requireStatus(r,200,'Owner login failed');
  const cookies=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():[r.headers.get('set-cookie')??''];const session=cookies.find(v=>v.startsWith('admin_session='));check(session&&/;\s*HttpOnly/i.test(session)&&/;\s*Secure/i.test(session)&&/;\s*SameSite=Strict/i.test(session),'Owner session cookie protections are missing.');ownerCookie=session.split(';')[0];
  for(const path of ['/admin','/admin/products','/admin/orders','/admin/creators','/admin/analytics','/admin/research'])requireStatus(await app(path,{html:true,auth:true}),200,'Protected owner route failed');
  requireStatus(await app('/api/admin/order-cases',{method:'POST',auth:true,foreign:true,body:create}),403,'Cross-origin refund mutation was allowed');
 });
 await verify('Two genuine signed callback replays remain idempotent',async()=>{
  const signature=createHmac('sha256',process.env.RAZORPAY_KEY_SECRET.trim()).update(`${before.order.razorpay_order_id}|${before.order.razorpay_payment_id}`).digest('hex');
  for(let n=0;n<2;n++){const r=await app('/api/verify-payment',{method:'POST',body:{razorpayOrderId:before.order.razorpay_order_id,razorpayPaymentId:before.order.razorpay_payment_id,razorpaySignature:signature}});requireStatus(r,200,'Genuine captured TEST payment replay failed');check(r.data?.success===true&&r.data.orderId===ORDER_ID&&r.data.testMode===true,'Replay did not return the same confirmed TEST order.');}
  const after=await snapshot();same(after,before,'Payment replay changed order, item, stock, payment, notification ledger or record counts.');report.payment_replay={count:2,same_order:true,unchanged_inventory_and_record_counts:true,notification_status:'suppressed_test'};
 });
 await verify('Evidence-based analytics and sourced research are accessible',async()=>{
  const day=indiaDay(before.order.created_at);const r=await app(`/api/admin/analytics?mode=test&from=${day}&to=${day}`,{auth:true});requireStatus(r,200,'Analytics API failed');privateResponse(r);check(r.data?.available===true&&r.data.sandbox===true&&r.data.mode==='test'&&r.data.summary?.paidCount===1&&r.data.summary?.revenue===34950,'Analytics does not show exactly 1 verified TEST order and 34950 paise.');
  const research=await app('/api/admin/research',{auth:true});requireStatus(research,200,'Research API failed');privateResponse(research);check(Array.isArray(research.data?.insights)&&research.data.insights.length===3&&research.data.insights.every(i=>typeof i.source_url==='string'&&i.source_url.startsWith('https://')&&i.researched_at&&['fact','estimate','hypothesis'].includes(i.evidence_type)),'Expected three dated, sourced research records.');report.intelligence={date_ist:day,test_paid_orders:1,test_revenue_paise:34950,research_records:3};
 });
 await verify('Manual refund create, approve, stale-version rejection and resolve',async()=>{
  const overId=randomUUID();requireStatus(await app('/api/admin/order-cases',{method:'POST',auth:true,body:{...create,id:overId,amount_rupees:349.51}}),400,'Refund above order total was accepted');
  const created=await app('/api/admin/order-cases',{method:'POST',auth:true,body:create});requireStatus(created,200,'Manual case creation failed');privateResponse(created);check(created.data?.manual_record_only===true&&created.data.case?.id===caseId&&created.data.case?.status==='requested'&&created.data.case.requested_amount_paise===100,'Manual refund case fields are incorrect.');report.manual_case={id:caseId,status:'requested',amount_paise:100,manual_record_only:true};
  const approved=await app('/api/admin/order-cases',{method:'POST',auth:true,body:{action:'transition',id:caseId,next_status:'approved',expected_updated_at:created.data.case.updated_at,note:'Fictional QA approval; no payment transfer.'}});requireStatus(approved,200,'Manual case approval failed');check(approved.data?.manual_record_only===true&&approved.data.case?.status==='approved','Case approval was not recorded.');report.manual_case.status='approved';
  const resolution={action:'transition',id:caseId,next_status:'resolved',note:'Fictional QA resolved. No refund executed; provider readback must show zero refunded.',external_reference:`QA-NO-TRANSFER-${caseId}`,expected_updated_at:approved.data.case.updated_at};
  requireStatus(await app('/api/admin/order-cases',{method:'POST',auth:true,body:{...resolution,expected_updated_at:created.data.case.updated_at}}),409,'Stale case version was accepted');
  const resolved=await app('/api/admin/order-cases',{method:'POST',auth:true,body:resolution});requireStatus(resolved,200,'Manual case resolution failed');check(resolved.data?.manual_record_only===true&&resolved.data.case?.status==='resolved','Manual case did not resolve.');report.manual_case.status='resolved';
  const saved=await app(`/api/admin/order-cases?order_id=${ORDER_ID}`,{auth:true});requireStatus(saved,200,'Manual case readback failed');privateResponse(saved);check(saved.data?.manual_record_only===true&&saved.data.cases?.filter(c=>c.id===caseId&&c.status==='resolved'&&c.requested_amount_paise===100).length===1&&!saved.data.cases.some(c=>c.id===overId),'Manual case readback or overamount rejection failed.');
 });
 await verify('No money, order, stock, catalog or production changes',async()=>{
  const after=await snapshot();const providerAfter=await provider(before.order.razorpay_payment_id);same(providerAfter,providerBefore,'Provider payment or refund state changed.');
  for(const key of ['order','product','items','payment','jobs'])same(after[key],before[key],`Unexpected ${key} change after manual service workflow.`);
  const expected={...before.total,preview_order_cases:before.total.preview_order_cases+1};same(after.total,expected,'Record counts changed beyond one fictional preview service case.');
  check(after.total.products===2&&after.total.orders===13,'Source production counts changed.');report.final={counts:after.total,stock:after.product.stock,provider_amount_refunded_paise:0,notifications_suppressed:true,production_counts_unchanged:true};
 });
 report.status='passed';
}
try{await main();}catch(error){report.status='failed';report.failure=error instanceof Error?error.message:'Verification failed.';for(const value of [process.env.ADMIN_SECRET,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.RAZORPAY_KEY_ID,process.env.RAZORPAY_KEY_SECRET,ownerCookie].filter(Boolean))report.failure=report.failure.split(value).join('[REDACTED]');process.exitCode=1;console.error(report.failure);}finally{
 report.completed_at=new Date().toISOString();if(guardsPassed){await mkdir(fileURLToPath(new URL('../docs/commerce/',import.meta.url)),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('Report: docs/commerce/final-deployed-verification.json');}
}
