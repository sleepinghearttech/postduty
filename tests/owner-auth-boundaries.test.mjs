import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url);
function load(path,deps,env={}) {
  const {outputText}=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const module={exports:{}};
  new vm.Script(outputText).runInContext(vm.createContext({module,exports:module.exports,require:id=>id in deps?deps[id]:nativeRequire(id),process:{env},Buffer,URL}));
  return module.exports;
}
const env={ADMIN_SECRET:'fictional-test-password',COMMERCE_OWNER_USER_ID:'explicit-owner',COMMERCE_OWNER_GOOGLE_SUB:'explicit-google',NODE_ENV:'production'};
function auth(user,customEnv=env) {
  return load('../src/lib/commerce-auth.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>undefined})},'@/lib/supabase':{supabaseAdmin:{auth:{getUser:async()=>({data:{user},error:null})}}}},customEnv);
}
const owner={id:'explicit-owner',identities:[{provider:'google',id:'explicit-google'}]};
function req({body={},origin='https://preview.example',token,passwordCookie}={}) {
  const headers=new Headers({'content-type':'application/json',origin});
  if(token) headers.set('authorization',token);
  return {headers,nextUrl:new URL('https://preview.example/api/admin/login'),cookies:{get:key=>key==='admin_session'&&passwordCookie?{value:passwordCookie}:undefined},text:async()=>typeof body==='string'?body:JSON.stringify(body)};
}
const next={NextResponse:{json:(body,init={})=>({body,status:init.status??200,headers:new Headers(init.headers),cookieValues:[],cookies:{set(...values){this.values=values;}}})}};

test('Google owner requires explicit user AND Google identity; user metadata never grants access',async()=>{
  assert.equal(await auth(owner).requireGoogleOwner('token'),true);
  assert.equal(await auth({...owner,id:'someone-else',user_metadata:{role:'owner'}}).requireGoogleOwner('token'),false);
  assert.equal(await auth({...owner,identities:[{provider:'google',id:'different'}]}).requireGoogleOwner('token'),false);
  assert.equal(await auth({...owner,is_anonymous:true}).requireGoogleOwner('token'),false);
  assert.equal(await auth(owner,{ADMIN_SECRET:'test'}).requireGoogleOwner('token'),false);
});
test('Google-session endpoint refuses unrelated bearer despite a valid legacy owner cookie',async()=>{
  const authHelpers=auth({...owner,id:'someone-else'});
  const request=req({token:'Bearer unrelated',passwordCookie:env.ADMIN_SECRET});
  assert.equal(await authHelpers.requireOwner(request),true);
  const route=load('../src/app/api/admin/google-session/route.ts',{'next/server':next,'@/lib/commerce-auth':authHelpers},env);
  const result=await route.POST(request);
  assert.equal(result.status,403);
  assert.equal(result.cookies.values,undefined);
});
test('Google-session issues cookie only for a verified bearer and rejects cross-site exchange',async()=>{
  const route=load('../src/app/api/admin/google-session/route.ts',{'next/server':next,'@/lib/commerce-auth':auth(owner)},env);
  assert.equal((await route.POST(req({token:'Bearer valid',origin:'https://attacker.example'}))).status,403);
  const result=await route.POST(req({token:'Bearer valid'}));
  assert.equal(result.status,200);assert.equal(result.cookies.values[0],'commerce_access_token');assert.equal(result.cookies.values[2].httpOnly,true);
});
test('legacy login rejects cross-origin, oversized, malformed and wrong passwords; valid login remains HTTP-only',async()=>{
  const route=load('../src/app/api/admin/login/route.ts',{'next/server':next,'@/lib/commerce-auth':auth(owner)},env);
  for(const [request,status] of [[req({body:{password:env.ADMIN_SECRET},origin:'https://attacker.example'}),403],[req({body:'x'.repeat(4097)}),413],[req({body:'{invalid'}),400],[req({body:{password:123}}),400],[req({body:{password:'wrong'}}),401]]) {
    const result=await route.POST(request);assert.equal(result.status,status);assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.cookies.values,undefined);
  }
  const good=await route.POST(req({body:{password:env.ADMIN_SECRET}}));
  assert.equal(good.status,200);assert.equal(good.cookies.values[0],'admin_session');assert.equal(good.cookies.values[2].httpOnly,true);assert.equal(good.cookies.values[2].sameSite,'strict');
});
