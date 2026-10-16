import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file,env={},fetch=async()=>({ok:false})) {
 const module={exports:{}};
 const reply=(status,body,headers={})=>({status,body,headers:new Headers(headers)});
 const NextResponse={next:()=>reply(200,null),json:(body,init={})=>reply(init.status??200,body,init.headers),redirect:url=>reply(307,null,{Location:String(url)})};
 const source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(source).runInContext(vm.createContext({module,exports:module.exports,process:{env},URL,fetch,require:id=>{assert.equal(id,'next/server');return {NextResponse};}}));
 return module.exports;
}
const env={COMMERCE_SANDBOX:'true',COMMERCE_PREVIEW_ACCESS:'owner',ADMIN_SECRET:'fictional-owner-password'};
function request(path,cookies={}) {
 const url=new URL(path,'https://test-preview.example');url.clone=()=>new URL(url);
 return {url:String(url),nextUrl:url,headers:new Headers({host:url.host}),cookies:{get:name=>cookies[name]?{value:cookies[name]}:undefined}};
}
test('private preview gates every content route, including checkout, QA, tracking and optimized images',async()=>{
 const {middleware}=load('../src/middleware.ts',env);
 for(const path of ['/','/christmas?design=classic','/store','/products/sample','/cart','/checkout','/orders/id','/order-confirmation/id','/qa/responsive','/_next/image?url=test','/sitemap.xml']) {
  const r=await middleware(request(path));assert.equal(r.status,307,path);
  const location=new URL(r.headers.get('location'));assert.equal(location.pathname,'/admin/login');
  assert.equal(location.searchParams.get('next'),path);assert.match(r.headers.get('cache-control'),/no-store/);
 }
});
test('private preview rejects unauthenticated APIs with JSON, including checkout and legacy endpoints',async()=>{
 const {middleware}=load('../src/middleware.ts',env);
 for(const path of ['/api/create-order','/api/verify-payment','/api/orders/lookup','/api/creator/profile','/api/admin/products']) {
  const r=await middleware(request(path));assert.equal(r.status,401,path);assert.match(r.body.error,/Sign in/);
 }
});
test('only exact login routes and static assets are public; forged sessions cannot bypass the gate',async()=>{
 const {middleware}=load('../src/middleware.ts',env);
 for(const path of ['/admin/login','/api/admin/login','/api/admin/google-session','/api/admin/logout','/_next/static/chunks/app.js','/favicon.ico'])assert.equal((await middleware(request(path))).status,200,path);
 assert.equal((await middleware(request('/api/admin/login/extra'))).status,401);
 assert.equal((await middleware(request('/store',{admin_session:'forged',commerce_access_token:'forged'}))).status,307);
 assert.equal((await middleware(request('/store',{admin_session:env.ADMIN_SECRET}))).status,200);
});
test('Google preview session requires both configured immutable identities and an authoritative verified user',async()=>{
 const googleEnv={...env,COMMERCE_OWNER_USER_ID:'owner-id',COMMERCE_OWNER_GOOGLE_SUB:'google-sub',NEXT_PUBLIC_SUPABASE_URL:'https://issuer.example',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'};
 const good={id:'owner-id',identities:[{provider:'google',id:'google-sub'}]};
 for(const [user,status] of [[good,200],[{...good,id:'other'},307],[{...good,is_anonymous:true},307],[{...good,identities:[{provider:'google',id:'other'}]},307]]) {
  const {middleware}=load('../src/middleware.ts',googleEnv,async(url,options)=>{assert.equal(url,'https://issuer.example/auth/v1/user');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>user};});
  assert.equal((await middleware(request('/christmas',{commerce_access_token:'test-token'}))).status,status);
 }
});
test('production public storefronts stay public even if the preview access flag is accidentally present',async()=>{
 const {middleware}=load('../src/middleware.ts',{...env,COMMERCE_SANDBOX:'false'});
 for(const path of ['/store','/christmas','/cart','/checkout'])assert.equal((await middleware(request(path))).status,200);
 assert.equal((await middleware(request('/admin/products'))).status,307);
});
test('sign-in return target rejects external URLs, malformed values, API paths and redirect loops',()=>{
 const {ownerReturnPath}=load('../src/lib/owner-return-path.ts');
 for(const value of [null,'https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)','/api/admin/login','/admin/login','/admin/login/','/store\n//evil.example','/'.padEnd(4100,'a')]) assert.equal(ownerReturnPath(value),'/admin');
 for(const value of ['/christmas?design=classic','/store?design=refined','/admin/products','/cart','/qa/responsive?width=360'])assert.equal(ownerReturnPath(value),value);
});
