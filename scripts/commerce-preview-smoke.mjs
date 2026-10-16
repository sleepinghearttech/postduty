/**
 * Deployed, isolated-preview API smoke test. Creates fictional preview products
 * and one unpaid Razorpay TEST order. Never captures a payment or fabricates paid data.
 *
 * PREVIEW_URL=https://<version>-postduty.jijo925.workers.dev
 * ADMIN_SECRET=<provided privately> node scripts/commerce-preview-smoke.mjs
 *
 * Do not pass secrets as CLI arguments. The script never prints cookies, secrets,
 * complete API bodies, or customer payloads. It does not run at import/build time.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const resultPath=fileURLToPath(new URL('../docs/commerce/deployed-smoke.json',import.meta.url));
const runId=`${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${randomBytes(3).toString('hex')}`;
let origin;
let ownerCookie='';
let guardsPassed=false;
const results={schema_version:1,run_id:runId,started_at:new Date().toISOString(),completed_at:null,status:'not_started',preview_url:null,tests:[],fixtures:[],uploads:[],provider_test_order:null,limitations:['API smoke test, not an Android browser usability test.','No payment capture, paid order, customer notification or payout is performed.','Provider order creation does not prove checkout completion or webhook delivery.']};

function check(condition,message){assert.ok(condition,message);}
function guardedOrigin(value){
 check(typeof value==='string'&&value.length>0,'PREVIEW_URL is required; nothing was contacted.');
 let url;try{url=new URL(value);}catch{throw new Error('PREVIEW_URL is invalid; nothing was contacted.');}
 check(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.pathname==='/', 'PREVIEW_URL must be a plain HTTPS version-preview origin.');
 check(/^[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?-postduty\.jijo925\.workers\.dev$/.test(url.hostname), 'Refusing a non-version or production hostname. Only a version-specific PostDuty workers.dev preview is allowed.');
 return url.origin;
}
async function fetchPreview(path,{method='GET',json,form,auth=false,crossOrigin=false,headers={}}={}){
 check(path.startsWith('/')&&!path.startsWith('//'),'Only same-preview relative request paths are allowed.');
 const url=new URL(path,origin);check(url.origin===origin,'Cross-origin network request refused.');
 const requestHeaders={Accept:'application/json, text/html;q=0.9',...headers};
 if(auth){check(ownerCookie,'Owner session has not been established.');requestHeaders.Cookie=ownerCookie;}
 if(method!=='GET') requestHeaders.Origin=crossOrigin?'https://untrusted.example.invalid':origin;
 if(json!==undefined)requestHeaders['Content-Type']='application/json';
 try{return await fetch(url,{method,headers:requestHeaders,body:json!==undefined?JSON.stringify(json):form,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30000)});}
 catch{throw new Error(`Network request failed for ${method} ${url.pathname}. No automatic mutation retry was attempted.`);}
}
async function api(path,options={}){
 const response=await fetchPreview(path,options);
 let data=null;try{data=await response.json();}catch{/* Keep response text out of logs. */}
 return {status:response.status,headers:response.headers,data};
}
async function page(path,auth=false){const response=await fetchPreview(path,{auth});return {status:response.status,headers:response.headers,html:await response.text()};}
async function verify(name,work){
 try{await work();results.tests.push({name,status:'passed'});console.log(`PASS ${name}`);}
 catch(error){results.tests.push({name,status:'failed'});throw error;}
}
function requireResponse(response,status,message){check(response.status===status,`${message} (HTTP ${response.status}; expected ${status}).`);}
function assertNoindex(html){
 const meta=html.match(/<meta\b[^>]*>/gi)??[];
 check(meta.some(tag=>/\bname=["']robots["']/i.test(tag)&&/\bcontent=["'][^"']*\bnoindex\b/i.test(tag)),'Preview HTML must explicitly contain robots noindex.');
}
function assertFictional(html){check(/fictional\s+(?:test\s+)?products/i.test(html)&&/preview/i.test(html),'Expected fictional/test preview notice is absent. Refusing mutations.');}
function productPath(product,storefront){return `/products/${encodeURIComponent(product.slug)}?storefront=${storefront}`;}
function hiddenPage(pageResult,product){
 check(!pageResult.html.includes(product.name),'A hidden product name appeared in public HTML.');
 check(pageResult.status===404||pageResult.html.includes('NEXT_HTTP_ERROR_FALLBACK;404'),'Hidden product did not return the expected not-found response.');
}
function safeProductResponse(data){
 check(data&&typeof data==='object'&&data.product&&typeof data.product.id==='string','Product endpoint did not return a saved product.');
 check(/^[0-9a-f-]{36}$/.test(data.product.id),'Product endpoint returned an invalid identifier.');return data.product;
}
async function update(product,action,extra={}){
 const response=await api('/api/admin/update-product',{method:'POST',auth:true,json:{id:product.id,updated_at:product.updated_at,action,...extra}});
 requireResponse(response,200,`Product ${action} failed`);return safeProductResponse(response.data);
}
async function assertPublicAssignment(product,expectedStores){
 for(const storefront of ['christmas','general']){
  const publicPage=await page(productPath(product,storefront));
  if(expectedStores.includes(storefront)){
   requireResponse(publicPage,200,'Published product could not be opened');
   check(publicPage.html.includes(product.name),'Published product name was not rendered.');
   check(publicPage.html.includes(product.image_url),'Published product image was not rendered.');
   assertNoindex(publicPage.html);
  }else hiddenPage(publicPage,product);
 }
 for(const [path,storefront] of [['/christmas','christmas'],['/store','general']]){
  const catalog=await page(path);requireResponse(catalog,200,'Storefront failed to load');
  check(catalog.html.includes(product.slug)===expectedStores.includes(storefront),'Storefront assignment did not match the canonical saved product.');
 }
}
async function saveReport(status,error=null){
 results.status=status;results.completed_at=new Date().toISOString();
 if(error)results.failure=error;
 await mkdir(fileURLToPath(new URL('../docs/commerce/',import.meta.url)),{recursive:true});
 await writeFile(resultPath,JSON.stringify(results,null,2)+'\n',{mode:0o600});
}

async function main(){
 origin=guardedOrigin(process.env.PREVIEW_URL);results.preview_url=origin;
 check(typeof process.env.ADMIN_SECRET==='string'&&process.env.ADMIN_SECRET.length>0,'ADMIN_SECRET must be supplied privately; nothing was contacted.');
 await verify('Version-preview environment and HTML safety markers',async()=>{
  for(const path of ['/christmas','/store']){const response=await page(path);requireResponse(response,200,'Preview storefront unavailable');assertFictional(response.html);assertNoindex(response.html);}
 });
 guardsPassed=true;results.status='running';
 await verify('Unauthenticated owner mutations and draft preview are denied',async()=>{
  for(const path of ['/api/admin/create-product','/api/admin/update-product','/api/admin/delete-product']){
   const response=await api(path,{method:'POST',json:{name:'Do not create',id:'00000000-0000-4000-8000-000000000000',price:1,stock:1}});
   check([401,403].includes(response.status),'An unauthenticated owner mutation was not denied.');
  }
  const response=await fetchPreview('/api/admin/upload-image',{method:'POST',form:new FormData()});
  check([401,403].includes(response.status),'An unauthenticated upload was not denied.');
 });
 await verify('Owner login issues a secure HttpOnly session',async()=>{
  const response=await api('/api/admin/login',{method:'POST',json:{password:process.env.ADMIN_SECRET}});requireResponse(response,200,'Owner login failed');
  const setCookies=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')??''];
  const session=setCookies.find(value=>value.startsWith('admin_session='));
  check(session&&/;\s*HttpOnly/i.test(session)&&/;\s*Secure/i.test(session)&&/;\s*SameSite=Strict/i.test(session),'Owner login did not set the expected protected session.');
  ownerCookie=session.split(';')[0];
 });
 await verify('Cross-origin owner mutation is rejected',async()=>{
  const response=await api('/api/admin/create-product',{method:'POST',auth:true,crossOrigin:true,json:{name:'Do not create',price:1,stock:1}});requireResponse(response,403,'Cross-origin owner mutation was not rejected');
 });
 const media={};
 await verify('Three photos and a video upload through the actual owner API',async()=>{
  for(const [name,type] of [['lantern.webp','image/webp'],['crochet.webp','image/webp'],['desk.webp','image/webp'],['test-motion.mp4','video/mp4']]){
   const source=await fetchPreview(`/commerce-preview/${name}`);requireResponse(source,200,'Committed fixture media is unavailable');
   check(!source.headers.get('content-type')?.includes('text/html'),'Fixture asset unexpectedly returned HTML.');
   const bytes=await source.arrayBuffer();check(bytes.byteLength>16&&bytes.byteLength<=25*1024*1024,'Fixture media has an invalid size.');
   const form=new FormData();form.append('file',new Blob([bytes],{type}),name);
   const response=await api('/api/admin/upload-image',{method:'POST',auth:true,form});requireResponse(response,200,'Owner media upload failed');
   check(typeof response.data?.url==='string'&&response.data.url.startsWith('https://')&&response.data.url.includes('/commerce-preview-media/'),'Upload did not use isolated preview storage.');
   check(response.data.type===(type.startsWith('video/')?'video':'image'),'Upload media type was not preserved.');
   media[name]={url:response.data.url,type:response.data.type,alt:`Fictional preview ${name==='test-motion.mp4'?'test clip':name.replace('.webp','')} — demonstration media`,attribution:'PostDuty fictional demonstration asset'};
   results.uploads.push({source_path:`/commerce-preview/${name}`,url:response.data.url,type:response.data.type,bytes:bytes.byteLength});
  }
 });
 await verify('Active SVG and disguised-image uploads are rejected',async()=>{
  for(const [type,name,body] of [['image/svg+xml','unsafe.svg','<svg xmlns="http://www.w3.org/2000/svg"><script>void 0</script></svg>'],['image/png','disguised.png','This is not a PNG file.']]){
   const form=new FormData();form.append('file',new Blob([body],{type}),name);
   const response=await api('/api/admin/upload-image',{method:'POST',auth:true,form});check([400,415,422].includes(response.status),'Unsafe or disguised media was not rejected.');
  }
 });
 const definitions=[
  {key:'lantern',name:'Fictional preview Kerala lantern',price:599.25,stock:7,category:'Christmas lanterns',storefronts:['christmas'],made_to_order:true,variants:[{id:'warm',name:'Warm ivory',price:64925,stock:3},{id:'natural',name:'Natural white',price:59925,stock:4}],media:[media['lantern.webp'],media['test-motion.mp4']]},
  {key:'crochet',name:'Fictional preview crochet star',price:349.50,stock:8,category:'Crochet gifts',storefronts:['general','christmas'],made_to_order:true,variants:[],media:[media['crochet.webp']]},
  {key:'desk',name:'Fictional preview healthcare desk gift',price:799,stock:5,category:'Healthcare-worker gifts',storefronts:['general'],made_to_order:false,variants:[],media:[media['desk.webp']]},
 ];
 const products=[];
 for(const definition of definitions){
  await verify(`Draft creation, persisted pricing and private preview: ${definition.key}`,async()=>{
   const privateMarker=`PRIVATE-SOURCING-${runId}-${definition.key}`;
   const body={name:`${definition.name} ${runId}`,slug:`fictional-preview-${definition.key}-${runId}`,price:definition.price,stock:definition.stock,description:'Fictional demonstration product for isolated preview testing. Not a live offer for sale.',image_url:definition.media[0].url,customisation_note:privateMarker,is_active:true,action:'publish',creator_id:null,
    commerce:{sku:`FICTIONAL-${runId}-${definition.key}`,category:definition.category,storefronts:definition.storefronts,collections:['Fictional preview collection'],short_description:'Fictional sample for testing the PostDuty owner workflow.',materials:'Fictional specification — confirm before any live listing.',media:definition.media,variants:definition.variants,made_to_order:definition.made_to_order,preparation_days:3,capacity:definition.stock,featured:true,personalization:{enabled:true,label:'Sample personalization',max_length:30,required:false}},
    operations:{license_status:'not_required',production_notes:'Fictional preview only. No manufacture, payment capture or fulfillment.',costs_rupees:{materials:75,labor:40,packaging:20}}};
   const response=await api('/api/admin/create-product',{method:'POST',auth:true,json:body});requireResponse(response,201,'Draft creation failed');
   let product=safeProductResponse(response.data);check(product.is_active===false,'Product creation ignored draft-by-default.');
   check(product.price===Math.round(definition.price*100)&&product.stock===definition.stock,'Stored integer-paise price or inventory differs from owner input.');
   check(JSON.stringify((product.commerce?.variants??[]).map(v=>[v.id,v.name,v.price,v.stock]))===JSON.stringify(definition.variants.map(v=>[v.id,v.name,v.price,v.stock])),'Canonical variants differ from input.');
   product=await update(product,'save');check(product.price===Math.round(definition.price*100)&&product.stock===definition.stock,'Reloaded product data changed price or inventory.');
   await assertPublicAssignment(product,[]);
   const anonymous=await page(`/admin/products/${product.id}/preview`);check([302,303,307,308,401,403].includes(anonymous.status),'Protected draft preview was exposed anonymously.');
   const authorized=await page(`/admin/products/${product.id}/preview`,true);requireResponse(authorized,200,'Authorized draft preview failed');check(authorized.html.includes(product.name),'Saved draft did not appear in owner preview.');
   check(!authorized.html.includes(privateMarker),'Private sourcing notes appeared in customer-style preview.');
   products.push({definition,product,privateMarker});
   results.fixtures.push({key:definition.key,id:product.id,slug:product.slug,name:product.name,status:'draft',price_paise:product.price,stock:product.stock,storefronts:definition.storefronts,owner_preview_url:`${origin}/admin/products/${product.id}/preview`,public_urls:definition.storefronts.map(storefront=>`${origin}${productPath(product,storefront)}`)});
  });
 }
 for(const fixture of products){
  await verify(`Owner publishing and storefront assignment: ${fixture.definition.key}`,async()=>{
   fixture.product=await update(fixture.product,'publish');check(fixture.product.is_active===true,'Explicit owner publish did not publish.');
   await assertPublicAssignment(fixture.product,fixture.definition.storefronts);
   for(const storefront of fixture.definition.storefronts){const publicPage=await page(productPath(fixture.product,storefront));check(!publicPage.html.includes(fixture.privateMarker),'Private sourcing notes leaked to public product HTML.');}
   results.fixtures.find(f=>f.id===fixture.product.id).status='published';
  });
 }
 const lantern=products.find(f=>f.definition.key==='lantern');const crochet=products.find(f=>f.definition.key==='crochet');
 await verify('Unpublish hides product immediately and explicit republish restores it',async()=>{
  lantern.product=await update(lantern.product,'unpublish');check(!lantern.product.is_active,'Unpublish failed');await assertPublicAssignment(lantern.product,[]);
  lantern.product=await update(lantern.product,'publish');await assertPublicAssignment(lantern.product,['christmas']);
 });
 await verify('Duplicate stays draft with zero inventory and can be safely archived',async()=>{
  let duplicate=await update(lantern.product,'duplicate');check(duplicate.id!==lantern.product.id&&!duplicate.is_active&&duplicate.stock===0,'Duplicate must be a new draft with zero inventory.');
  check((duplicate.commerce?.variants??[]).every(variant=>variant.stock===0),'Duplicate variant inventory was not reset.');
  await assertPublicAssignment(duplicate,[]);duplicate=await update(duplicate,'archive');check(!duplicate.is_active&&duplicate.commerce?.archived===true,'Duplicate was not archived.');
  results.archived_duplicate={id:duplicate.id,slug:duplicate.slug,status:'archived',stock:duplicate.stock};
 });
 const customer={customerName:'Fictional Preview Buyer',customerEmail:'preview-buyer@example.invalid',customerPhone:'9999999999',shippingAddress:'Fictional test address only, do not ship, Bengaluru 560001'};
 await verify('Invalid stock, variants, fractional quantities and storefronts are rejected before payment',async()=>{
  const invalid=[
   {storefront:'christmas',items:[{productId:lantern.product.id,quantity:99,variantId:'warm'}]},
   {storefront:'christmas',items:[{productId:lantern.product.id,quantity:1.5,variantId:'warm'}]},
   {storefront:'christmas',items:[{productId:lantern.product.id,quantity:1,variantId:'invalid'}]},
   {storefront:'general',items:[{productId:lantern.product.id,quantity:1,variantId:'warm'}]},
   {storefront:'third',items:[{productId:crochet.product.id,quantity:1}]},
  ];
  for(const body of invalid){const response=await api('/api/create-order',{method:'POST',json:{...body,...customer}});check([400,409].includes(response.status),'Invalid checkout was not rejected before provider order creation.');check(!response.data?.razorpayOrderId,'Invalid checkout unexpectedly produced a payment order.');}
 });
 await verify('Real test-provider order uses authoritative variant prices despite tampered client totals',async()=>{
  const expected=2*64925+34950;
  const response=await api('/api/create-order',{method:'POST',json:{...customer,storefront:'christmas',items:[{productId:lantern.product.id,quantity:2,variantId:'warm',personalization:'FICTIONAL TEST',unitPrice:1},{productId:crochet.product.id,quantity:1,unitPrice:1}],totalAmount:1,discountAmount:expected,unitPrice:1,isGift:false}});
  requireResponse(response,200,'Test-provider order creation failed; real test checkout remains blocked');
  check(response.data?.testMode===true&&typeof response.data?.keyId==='string'&&response.data.keyId.startsWith('rzp_test_'),'Checkout did not confirm test mode.');
  check(response.data?.amount===expected&&response.data.currency==='INR','Provider order did not preserve canonical variant pricing in paise.');
  check(typeof response.data.razorpayOrderId==='string'&&/^order_\w+$/.test(response.data.razorpayOrderId),'Provider did not return a valid order reference.');
  results.provider_test_order={reference:response.data.razorpayOrderId,amount_paise:response.data.amount,currency:'INR',test_mode:true,status:'created_unpaid',payment_captured:false};
 });
 await verify('Forged payment verification cannot manufacture a paid order',async()=>{
  const response=await api('/api/verify-payment',{method:'POST',json:{razorpayOrderId:results.provider_test_order.reference,razorpayPaymentId:'pay_fictional_unpaid',razorpaySignature:'0'.repeat(64),totalAmount:1,items:[]}});
  check([400,403].includes(response.status),'Forged payment verification was not rejected.');check(!response.data?.success&&!response.data?.orderId,'Forged verification returned a confirmed order.');
 });
 await verify('Unpaid provider order leaves canonical stock and variant stock unchanged',async()=>{
  const before=lantern.product;lantern.product=await update(before,'save');check(lantern.product.stock===7,'Unpaid provider order changed parent inventory.');
  check(lantern.product.commerce.variants.find(v=>v.id==='warm')?.stock===3,'Unpaid provider order changed variant inventory.');
 });
 await saveReport('passed');ownerCookie='';console.log(`Deployed preview smoke passed. Evidence: ${resultPath}`);
}

main().catch(async error=>{
 ownerCookie='';
 const message=error instanceof assert.AssertionError||error instanceof Error?error.message:'Unexpected smoke-test failure.';
 // Every error message above is our own bounded diagnostic, never an API body or secret.
 const secret=process.env.ADMIN_SECRET;
 const safeMessage=(secret?message.replaceAll(secret,'[REDACTED]'):message).slice(0,600);
 if(guardsPassed)await saveReport('failed',safeMessage).catch(()=>{});
 console.error(`Preview smoke stopped: ${safeMessage}`);process.exitCode=1;
});
