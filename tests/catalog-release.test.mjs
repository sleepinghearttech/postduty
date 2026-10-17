import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { catalogMode } from './helpers/catalog-mode.mjs';
function route(file,env){
 const module={exports:{}};
 const source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const forbidden=()=>{throw Error('Database or payment access must not occur');};
 new vm.Script(source).runInContext(vm.createContext({module,exports:module.exports,process:{env},require:id=>id==='@/lib/catalog-mode'?catalogMode(env):id==='next/server'?{NextResponse:{json:(body,init)=>({body,...init})}}:id==='@/lib/supabase'?{supabaseAdmin:{from:forbidden}}:{},fetch:forbidden}));
 return module.exports.POST;
}
test('catalog-only order creation rejects before request parsing, persistence or provider access',async()=>{
 const post=route('../src/app/api/create-order/route.ts',{COMMERCE_CATALOG_ONLY:'true'});
 const result=await post({});assert.equal(result.status,503);assert.match(result.body.error,/Ordering is not open/);
});
for(const env of [{COMMERCE_CATALOG_ONLY:'true',ORDER_NOTIFICATIONS_ENABLED:'true'},{ORDER_NOTIFICATIONS_ENABLED:'false'},{}]){
 test('disabled follow-up job cannot mark historical orders sent: '+JSON.stringify(env),async()=>{
  const result=await route('../src/app/api/cron/post-purchase/route.ts',env)({});assert.equal(result.status,403);
 });
}
