import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTransport(path, env) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const module={exports:{}}; let requests=0;
  const context=vm.createContext({module,exports:module.exports,process:{env},console:{log(){},error(){}},fetch:async()=>{requests++;throw new Error('Network must not be reached');}});
  new vm.Script(outputText).runInContext(context);
  return {functions:Object.entries(module.exports).filter(([name])=>name.startsWith('send')).map(([,fn])=>fn),count:()=>requests};
}
const fictional={id:'fictional',customer_name:'Test',customer_email:'test@example.invalid',customer_phone:'9000000000',shipping_address:'Fictional address',total_amount:10000,tracking_number:'TEST',status:'paid',created_at:'2026-01-01'};
const enabledEnv={ORDER_NOTIFICATIONS_ENABLED:'true',WHATSAPP_PERMANENT_TOKEN:'mock',WHATSAPP_PHONE_NUMBER_ID:'mock',ADMIN_WHATSAPP_NUMBER:'9000000000',RESEND_API_KEY:'mock'};
for(const module of ['email','notifications']) {
  test(`${module}: sandbox suppresses every transport even if notifications are enabled`,async()=>{
    const transport=loadTransport(`../src/lib/${module}.ts`,{...enabledEnv,COMMERCE_SANDBOX:'true'});
    assert.ok(transport.functions.length>0);
    for(const fn of transport.functions) await fn(fictional,'MOCK');
    assert.equal(transport.count(),0);
  });
  test(`${module}: test-order flags suppress every transport outside sandbox`,async()=>{
    const transport=loadTransport(`../src/lib/${module}.ts`,{...enabledEnv,COMMERCE_SANDBOX:'false'});
    for(const flags of [{is_test:true},{payment_mode:'test'}]) for(const fn of transport.functions) await fn({...fictional,...flags},'MOCK');
    assert.equal(transport.count(),0);
  });
}
