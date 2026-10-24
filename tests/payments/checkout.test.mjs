import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {parseCheckoutRequest,buildCheckoutSnapshot,paymentConfiguration,validHmac,assertCapturedPayment} from '../../src/lib/checkout-contract.ts';
const id='10000000-0000-4000-8000-000000000001';
const product={id,name:'Fictional ornament',price:25000,stock:5,is_active:true,commerce:{storefronts:['general','christmas']}};
const request=(overrides={})=>parseCheckoutRequest({items:[{productId:id,quantity:1}],storefront:'christmas',...overrides});

test('client-supplied amounts, prices and creator identities cannot affect the authoritative snapshot',()=>{
 const parsed=request({totalAmount:1,discountAmount:25000,items:[{productId:id,quantity:2,unitPrice:1,creator_id:'fraud'}]});
 const s=buildCheckoutSnapshot(parsed,[product],null);
 assert.equal(s.totalAmount,50000+4900); assert.equal(s.lines[0].unit_price,25000); assert.equal(s.lines[0].creator_id,null);
});
test('rejects fractional, negative, zero, oversized, and nonnumeric quantities',()=>{
 for(const quantity of [0,-1,1.5,101,'1',NaN,Infinity]) assert.throws(()=>request({items:[{productId:id,quantity}]}),/quantity/);
});
test('aggregates repeated lines and variants against canonical shared stock',()=>{
 assert.throws(()=>buildCheckoutSnapshot(request({items:[{productId:id,quantity:3},{productId:id,quantity:3}]}),[product],null),/stock/);
 const p={...product,stock:2,commerce:{...product.commerce,variants:[{id:'red',name:'Red',price:30000,stock:2},{id:'green',name:'Green',price:35000,stock:2}]}};
 assert.throws(()=>buildCheckoutSnapshot(request({items:[{productId:id,quantity:2,variantId:'red'},{productId:id,quantity:1,variantId:'green'}]}),[p],null),/stock/);
 const s=buildCheckoutSnapshot(request({items:[{productId:id,quantity:1,variantId:'red'}]}),[p],null);
 assert.equal(s.totalAmount,30000+4900); assert.equal(s.lines[0].variant_id,'red'); assert.equal(s.lines[0].variant_name,'Red');
});
test('drafts, archived products and wrong storefront assignments cannot be purchased',()=>{
 for(const p of [{...product,commerce:{...product.commerce,catalog_only:true}},{...product,is_active:false},{...product,commerce:{archived:true}},{...product,commerce:{storefronts:['general']}}]) assert.throws(()=>buildCheckoutSnapshot(request(),[p],null),/unavailable/);
});
test('legacy products default to general storefront and retain single-product input',()=>{
 const p={...product,commerce:undefined};
 const parsed=parseCheckoutRequest({productId:id,quantity:1});
 assert.equal(buildCheckoutSnapshot(parsed,[p],null).totalAmount,25000+4900);
 assert.throws(()=>buildCheckoutSnapshot(request(),[p],null),/unavailable/);
});
test('variant selection and personalization rules are enforced server-side',()=>{
 const p={...product,commerce:{...product.commerce,variants:[{id:'red',price:30000,stock:5}],personalization:{enabled:true,required:true,max_length:10}}};
 assert.throws(()=>buildCheckoutSnapshot(request(),[p],null),/option/);
 assert.throws(()=>buildCheckoutSnapshot(request({items:[{productId:id,quantity:1,variantId:'red'}]}),[p],null),/personalization/);
 assert.throws(()=>buildCheckoutSnapshot(request({items:[{productId:id,quantity:1,variantId:'red',personalization:'way too long here'}]}),[p],null),/personalization/);
 const s=buildCheckoutSnapshot(request({items:[{productId:id,quantity:1,variantId:'red',personalization:'Test'}]}),[p],null);
 assert.equal(s.lines[0].personalization,'Test');
});
test('coupon discount, gift charge and expiry use server values; invalid coupon is not silently removed',()=>{
 const coupon={code:'TEST',is_active:true,expires_at:null,max_uses:1,times_used:0,min_order:0,discount_type:'percent',discount_value:10};
 const s=buildCheckoutSnapshot(request({couponCode:'test',isGift:true}),[product],coupon);
 assert.equal(s.totalAmount,24500+4900); assert.equal(s.discountAmount,2500); assert.equal(s.shippingCharge,4900);
 for(const c of [null,{...coupon,times_used:1},{...coupon,expires_at:'2020-01-01'}]) assert.throws(()=>buildCheckoutSnapshot(request({couponCode:'test'}),[product],c),/coupon/);
});
test('missing or live sandbox credentials fail closed',()=>{
 assert.throws(()=>paymentConfiguration({}),/not configured/);
 assert.throws(()=>paymentConfiguration({COMMERCE_SANDBOX:'true',RAZORPAY_KEY_ID:'rzp_live_fixture',RAZORPAY_KEY_SECRET:'fixture'}),/test-mode/);
 assert.equal(paymentConfiguration({COMMERCE_SANDBOX:'true',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'fixture'}).testMode,true);
});
test('signature check rejects absent secrets, malformed signatures and tampered IDs',()=>{
 const message='order_fixture|pay_fixture'; const signature=createHmac('sha256','fixture-secret').update(message).digest('hex');
 assert.equal(validHmac(message,signature,'fixture-secret'),true);
 for(const [m,s,k] of [[message,signature,''],[message,'bad','fixture-secret'],['order_other|pay_fixture',signature,'fixture-secret']]) assert.equal(validHmac(m,s,k),false);
});
test('payment confirmation requires matching captured payment, amount, currency, order and ID',()=>{
 const expected={paymentId:'pay_fixture',orderId:'order_fixture',amount:25000,currency:'INR'};
 const captured={id:'pay_fixture',order_id:'order_fixture',amount:25000,currency:'INR',status:'captured',captured:true,amount_refunded:0};
 assert.equal(assertCapturedPayment(captured,expected).status,'captured');
 for(const patch of [{status:'authorized',captured:false},{status:'failed'},{amount:1},{currency:'USD'},{order_id:'order_other'},{id:'pay_other'},{amount_refunded:1}]) assert.throws(()=>assertCapturedPayment({...captured,...patch},expected),/matching captured/);
});
test('customer details are validated before payment; HTML injection is rejected',()=>{
 assert.throws(()=>request({customerName:'<script>',customerEmail:'test@example.com',customerPhone:'9999999999',shippingAddress:'Fictional address only'}),/customer name/);
 const parsed=request({customerName:'Test Buyer',customerEmail:'test@example.com',customerPhone:'9999999999',shippingAddress:'Fictional test address only'});
 assert.equal(parsed.customer.name,'Test Buyer');
});

test('creator commission is owner-configured, validated active and snapshotted after allocated discounts',()=>{
 const creatorId='40000000-0000-4000-8000-000000000001';
 const p={...product,creator_id:creatorId};
 const creator={id:creatorId,status:'active',commission_bps:1250};
 const coupon={code:'TEST',is_active:true,expires_at:null,max_uses:null,times_used:0,min_order:0,discount_type:'flat',discount_value:101};
 const s=buildCheckoutSnapshot(request({couponCode:'TEST',isGift:true,items:[{productId:id,quantity:1,commission_bps:0,creator_earning_paise:999999}]}),[p],coupon,Date.now(),[creator]);
 const line=s.lines[0];
 assert.equal(line.commission_bps,1250);assert.equal(line.line_discount_amount,101);assert.equal(line.commission_amount,3112);assert.equal(line.creator_earning_paise,21787);
 assert.equal(line.creator_earning_paise+line.commission_amount,s.subtotal-s.discountAmount);
 assert.equal(s.totalAmount,26899+4900); // Gift card and shipping belong to PostDuty, outside creator proceeds.
 creator.commission_bps=9999;assert.equal(line.commission_bps,1250);
 assert.doesNotThrow(()=>buildCheckoutSnapshot(request(),[p],null,Date.now(),[{...creator,status:'invited'}]));
 for(const creators of [[],[{...creator,status:'suspended'}],[{...creator,status:'unknown'}],[{...creator,commission_bps:10001}],[{...creator,commission_bps:1.5}]]) assert.throws(()=>buildCheckoutSnapshot(request(),[p],null,Date.now(),creators),/creator product/);
});
test('largest-remainder allocation accounts for every discounted paise across mixed creator/owned lines',()=>{
 const ids=[id,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
 const creatorId='40000000-0000-4000-8000-000000000001';
 const products=ids.map((itemId,index)=>({...product,id:itemId,price:100,creator_id:index===2?null:creatorId}));
 const creator={id:creatorId,status:'active',commission_bps:1000};
 const coupon={code:'TEST',is_active:true,expires_at:null,max_uses:null,times_used:0,min_order:0,discount_type:'flat',discount_value:2};
 const s=buildCheckoutSnapshot(request({couponCode:'TEST',items:ids.map(productId=>({productId,quantity:1}))}),products,coupon,Date.now(),[creator]);
 assert.deepEqual(s.lines.map(l=>l.line_discount_amount),[1,1,0]);assert.equal(s.lines.reduce((sum,l)=>sum+l.line_discount_amount,0),2);
 assert.equal(s.lines[2].creator_earning_paise,null);assert.equal(s.lines[2].commission_amount,0);
 assert.equal(s.lines[0].creator_earning_paise,89);assert.equal(s.lines[1].commission_amount,10);
});
test('zero and full commission preserve conservation of creator proceeds without gift-card leakage',()=>{
 const creatorId='40000000-0000-4000-8000-000000000001';
 for(const basisPoints of [0,10000]) {
  const s=buildCheckoutSnapshot(request({isGift:true}),[{...product,creator_id:creatorId}],null,Date.now(),[{id:creatorId,status:'active',commission_bps:basisPoints}]);
  assert.equal(s.lines[0].creator_earning_paise,basisPoints===0?25000:0);
  assert.equal(s.lines[0].creator_earning_paise+s.lines[0].commission_amount,25000);
 }
});
test('made-to-order stock is finite production slots; capacity metadata never creates inventory',()=>{
 const p={...product,stock:1,commerce:{...product.commerce,made_to_order:true,capacity:100}};
 assert.throws(()=>buildCheckoutSnapshot(request({items:[{productId:id,quantity:2}]}),[p],null),/production slots/);
 assert.equal(buildCheckoutSnapshot(request(),[p],null).lines[0].quantity,1);
});
