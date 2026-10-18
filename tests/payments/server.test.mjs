import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as contract from '../../src/lib/checkout-contract.ts';
const source=await readFile(new URL('../../src/lib/checkout-server.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function server({payment,dbError=false,rpcError=false,testMode=true}={}) {
 const writes=[];let rpcCalls=0;let notifications=0;
 const intent={id:'20000000-0000-4000-8000-000000000001',provider_order_id:'order_fixture',total_amount:25000,currency:'INR',is_test:testMode,customer:{name:'Fictional Buyer',email:'buyer@example.invalid',phone:'9999999999',address:'Fictional QA address'}};
 const admin={from(table){
   const query={select(){return query;},eq(){return query;},is(){return query;},async maybeSingle(){return {data:table.endsWith('checkout_intents')?intent:null,error:dbError?{message:'fixture'}:null};},async upsert(body){writes.push({table,body});return {error:null};},update(body){writes.push({table,body});return query;},then(resolve){resolve({data:null,error:null});}};return query;
 },async rpc(name,args){rpcCalls++;writes.push({rpc:name,args});return {data:rpcError?null:{status:'confirmed',order_id:'30000000-0000-4000-8000-000000000001',created:true},error:rpcError?{message:'fixture'}:null};}};
 const exports={};const module={exports};
 const imports={
   'server-only':{},'@/lib/supabase':{supabaseAdmin:admin},'@/lib/commerce-db':{commerceTable:n=>`preview_${n}`,isCommerceSandbox:()=>true},'@/lib/checkout-contract':contract,
   '@/lib/notifications':{sendAdminWhatsAppAlert:async()=>notifications++,sendCustomerWhatsAppConfirmation:async()=>notifications++},'@/lib/email':{sendOrderEmails:async()=>notifications++}
 };
 const env={COMMERCE_SANDBOX:'true',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'fixture-secret',ORDER_NOTIFICATIONS_ENABLED:'true'};
 const provider=payment??{id:'pay_fixture',order_id:'order_fixture',amount:25000,currency:'INR',captured:true,status:'captured',amount_refunded:0};
 vm.runInNewContext(compiled,{module,exports,require:name=>{if(!(name in imports))throw new Error(`unexpected dependency ${name}`);return imports[name];},process:{env},Buffer,AbortSignal,fetch:async(url)=>{assert.equal(url,'https://api.razorpay.com/v1/payments/pay_fixture');return{ok:true,json:async()=>provider};}});
 return {api:module.exports,writes,get rpcCalls(){return rpcCalls;},get notifications(){return notifications;}};
}
test('server fetches provider and persists matching capture before atomic finalization',async()=>{
 const s=server();assert.equal((await s.api.verifyAndFinalize('order_fixture','pay_fixture')).status,'confirmed');
 assert.equal(s.writes[0].table,'preview_checkout_payments');assert.equal(s.writes[0].body.amount,25000);assert.equal(s.writes[1].rpc,'preview_finalize_checkout_payment');assert.equal(s.writes[1].args.p_customer,null);
});
test('provider-authorized/underpaid/wrong-order payments never reach paid-order RPC',async()=>{
 for(const patch of [{status:'authorized',captured:false},{amount:1},{currency:'USD'},{order_id:'order_other'}]){
  const s=server({payment:{id:'pay_fixture',order_id:'order_fixture',amount:25000,currency:'INR',status:'captured',captured:true,...patch}});
  await assert.rejects(s.api.verifyAndFinalize('order_fixture','pay_fixture'),/matching captured/);assert.equal(s.rpcCalls,0);assert.equal(s.writes.length,0);
 }
});
test('test-mode payments suppress all customer/admin notifications even with notification flag enabled',async()=>{
 const s=server();await s.api.verifyAndFinalize('order_fixture','pay_fixture');assert.equal(s.notifications,0);
});
test('finalization failure retains captured evidence and a sanitized reconciliation reason',async()=>{
 const s=server({rpcError:true});await assert.rejects(s.api.verifyAndFinalize('order_fixture','pay_fixture'),/reconciliation/);
 assert.equal(s.writes[0].body.provider_payment_id,'pay_fixture');assert.equal(s.writes.at(-1).body.reason,'finalization_failed');
});
test('saved customer address cannot be overwritten by post-payment callback metadata',async()=>{
 const s=server();await s.api.verifyAndFinalize('order_fixture','pay_fixture',{name:'Other',email:'other@example.invalid',phone:'1111111111',address:'Changed shipping address'});
 assert.equal(s.writes[1].args.p_customer,null);
});
