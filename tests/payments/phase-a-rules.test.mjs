import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCheckoutRequest, buildCheckoutSnapshot, shippingChargeFor, parseAllowedStates, assertShippingState, assertCheckoutReady,
  validPincode, normalizeIndianMobile, inclusiveTax, gstBreakdown, sellerStateCode, INDIAN_STATES, parseCustomer,
} from '../../src/lib/checkout-contract.ts';
import { validateCommerce } from '../../src/lib/product-validation.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { catalogMode } from '../helpers/catalog-mode.mjs';
import * as contract from '../../src/lib/checkout-contract.ts';

const id='10000000-0000-4000-8000-000000000001';
const id2='10000000-0000-4000-8000-000000000002';
const product={id,name:'Fictional ornament',price:25000,stock:10,is_active:true,commerce:{storefronts:['general'],hsn:'7117',gst_rate_bps:300}};
const product2={...product,id:id2,price:10000,commerce:{storefronts:['general'],hsn:'9503',gst_rate_bps:1200}};
const address={customerName:'Test Buyer',customerEmail:'Buyer@Example.invalid',customerPhone:'+91 98765 43210',addressLine1:'1 Fictional Street',addressLine2:'Near Test Landmark',city:'Testpur',stateCode:'29',pincode:'560001'};
const request=(overrides={})=>parseCheckoutRequest({items:[{productId:id,quantity:1}],storefront:'general',...address,acceptTerms:true,...overrides});

test('shipping: exactly one item in total costs ₹49 (4900 paise); two or more items ship free',()=>{
  assert.equal(shippingChargeFor(1),4900);
  for(const quantity of [2,3,50]) assert.equal(shippingChargeFor(quantity),0);
  for(const quantity of [0,-1,1.5,NaN]) assert.throws(()=>shippingChargeFor(quantity),/at least one/);
  const one=buildCheckoutSnapshot(request(),[product],null);
  assert.equal(one.shippingCharge,4900);assert.equal(one.totalAmount,25000+4900);
  const twoOfOne=buildCheckoutSnapshot(request({items:[{productId:id,quantity:2}]}),[product],null);
  assert.equal(twoOfOne.shippingCharge,0);assert.equal(twoOfOne.totalAmount,50000);
  const twoLines=buildCheckoutSnapshot(request({items:[{productId:id,quantity:1},{productId:id2,quantity:1}]}),[product,product2],null);
  assert.equal(twoLines.shippingCharge,0);assert.equal(twoLines.totalAmount,35000);
});
test('client-supplied shipping is ignored; coupons never discount shipping or push it below zero',()=>{
  const s=buildCheckoutSnapshot(request({shippingCharge:0,shipping_charge:0}),[product],null);
  assert.equal(s.shippingCharge,4900);
  const flat={code:'BIG',is_active:true,expires_at:null,max_uses:null,times_used:0,min_order:0,discount_type:'flat',discount_value:999999};
  const discounted=buildCheckoutSnapshot(request({couponCode:'BIG',items:[{productId:id2,quantity:1}]}),[product2],flat);
  assert.equal(discounted.discountAmount,10000);assert.equal(discounted.shippingCharge,4900);assert.equal(discounted.totalAmount,4900);
});
test('total consistency: every snapshot total equals subtotal + gift + shipping − discount',()=>{
  const percent={code:'TEN',is_active:true,expires_at:null,max_uses:null,times_used:0,min_order:0,discount_type:'percent',discount_value:10};
  for(const items of [[{productId:id,quantity:1}],[{productId:id,quantity:2}],[{productId:id,quantity:1},{productId:id2,quantity:3}]]) for(const isGift of [true,false]) for(const coupon of [null,percent]) {
    const s=buildCheckoutSnapshot(request({items,isGift,couponCode:coupon?.code}),[product,product2],coupon);
    assert.equal(s.totalAmount,s.subtotal+s.giftCharge+s.shippingCharge-s.discountAmount);
    assert.ok(s.discountAmount<=s.subtotal);assert.ok(s.shippingCharge>=0);
  }
});
test('state allow-list: empty/unset serves every state; listed codes only; others rejected with the served list',()=>{
  assert.equal(parseAllowedStates(undefined),null);assert.equal(parseAllowedStates(''),null);assert.equal(parseAllowedStates('  '),null);
  const allowed=parseAllowedStates('29, 32,33,99');
  assert.deepEqual([...allowed].sort(),['29','32','33']);
  assert.doesNotThrow(()=>assertShippingState('32',allowed));
  assert.throws(()=>assertShippingState('27',allowed),/do not deliver to Maharashtra yet\. We currently deliver to: Karnataka, Kerala, Tamil Nadu\./);
  assert.doesNotThrow(()=>assertShippingState('27',null));
  assert.throws(()=>assertShippingState('25',null),/Select the state/);
  // A misconfigured non-empty list fails closed instead of silently serving everywhere.
  const broken=parseAllowedStates('XX');assert.equal(broken.size,0);assert.throws(()=>assertShippingState('29',broken),/temporarily unavailable/);
  assert.equal(INDIAN_STATES.length,36);assert.equal(new Set(INDIAN_STATES.map(s=>s.code)).size,36);
});
test('checkout readiness requires a structured served address and explicit (not default) terms acceptance',()=>{
  assert.equal(assertCheckoutReady(request(),null).state,'Karnataka');
  assert.throws(()=>assertCheckoutReady(request({acceptTerms:undefined}),null),/accept the Terms/);
  assert.throws(()=>assertCheckoutReady(request({acceptTerms:'true'}),null),/accept the Terms/);
  assert.throws(()=>assertCheckoutReady(request({stateCode:'32'}),parseAllowedStates('29')),/do not deliver to Kerala/);
  const legacy=parseCheckoutRequest({items:[{productId:id,quantity:1}],customerName:'Test Buyer',customerEmail:'test@example.invalid',customerPhone:'9999999999',shippingAddress:'Fictional test address only',acceptTerms:true});
  assert.throws(()=>assertCheckoutReady(legacy,null),/full delivery address/);
  assert.throws(()=>assertCheckoutReady(parseCheckoutRequest({items:[{productId:id,quantity:1}],acceptTerms:true}),null),/full delivery address/);
});
test('PIN prefix limit: unset serves all; listed prefixes only; a misconfigured list fails closed',()=>{
  const {parseAllowedPinPrefixes,assertShippingPin}=contract;
  assert.equal(parseAllowedPinPrefixes(undefined),null);assert.equal(parseAllowedPinPrefixes(' '),null);
  const blr=parseAllowedPinPrefixes('560');
  assert.doesNotThrow(()=>assertShippingPin('560054',blr));
  assert.throws(()=>assertShippingPin('570001',blr),/deliver only to PIN codes starting with 560/);
  assert.doesNotThrow(()=>assertShippingPin('570001',null));
  const broken=parseAllowedPinPrefixes('XX');assert.equal(broken.length,0);assert.throws(()=>assertShippingPin('560054',broken),/temporarily unavailable/);
  assert.throws(()=>assertCheckoutReady(request({pincode:'570001'}),parseAllowedStates('29'),blr),/PIN 570001/);
  assert.equal(assertCheckoutReady(request(),parseAllowedStates('29'),blr).pincode,'560001');
});
test('delivery options: same-day is a flat ₹99 limited to listed PIN prefixes; standard keeps ₹49/free; method is stored on the customer',()=>{
  assert.equal(shippingChargeFor(1,'same_day'),9900);assert.equal(shippingChargeFor(3,'same_day'),9900);assert.equal(shippingChargeFor(2,'standard'),0);
  assert.equal(request().deliveryMethod,'standard');
  assert.throws(()=>request({deliveryMethod:'drone'}),/Invalid delivery option/);
  const blr=contract.parseAllowedPinPrefixes('560');
  const sameDay=request({deliveryMethod:'same_day',items:[{productId:id,quantity:2}]});
  assert.equal(assertCheckoutReady(sameDay,parseAllowedStates('29'),null,blr).delivery_method,'same_day');
  assert.equal(buildCheckoutSnapshot(sameDay,[product],null).shippingCharge,9900);
  assert.throws(()=>assertCheckoutReady(request({deliveryMethod:'same_day',pincode:'570001'}),parseAllowedStates('29'),null,blr),/Same-day delivery is available only/);
  assert.throws(()=>assertCheckoutReady(request({deliveryMethod:'same_day'}),null,null,null),/not available right now/);
  assert.equal(assertCheckoutReady(request({pincode:'570001'}),parseAllowedStates('29'),null,blr).delivery_method,'standard');
});
test('PIN code must be exactly six digits and cannot start with zero',()=>{
  for(const pin of ['560001','110001','999999']) assert.equal(validPincode(pin),true,pin);
  for(const pin of ['056000','56000','5600011','56000a',' 560001',560001,'']) assert.equal(validPincode(pin),false,String(pin));
  assert.throws(()=>request({pincode:'56001'}),/6-digit PIN/);
});
test('phone must be a 10-digit Indian mobile; +91/0 prefixes and separators are normalised',()=>{
  for(const [input,expected] of [['9876543210','9876543210'],['+91 98765 43210','9876543210'],['+91-9876543210','9876543210'],['09876543210','9876543210'],['919876543210','9876543210'],['(98765) 43210','9876543210']]) assert.equal(normalizeIndianMobile(input),expected,input);
  for(const input of ['5876543210','987654321','98765432101','+1 202 555 0100','98765x3210','',9876543210]) assert.equal(normalizeIndianMobile(input),null,String(input));
  assert.throws(()=>request({customerPhone:'12345'}),/10-digit Indian mobile/);
});
test('structured address is stored with a composed single-line address for existing consumers',()=>{
  const c=parseCustomer({...address});
  assert.deepEqual(c,{name:'Test Buyer',email:'buyer@example.invalid',phone:'9876543210',address:'1 Fictional Street, Near Test Landmark, Testpur, Karnataka - 560001',address_line1:'1 Fictional Street',address_line2:'Near Test Landmark',city:'Testpur',state_code:'29',state:'Karnataka',pincode:'560001',country:'IN'});
  assert.equal(parseCustomer({...address,addressLine2:''}).address,'1 Fictional Street, Testpur, Karnataka - 560001');
  assert.equal(parseCustomer({...address,addressLine2:undefined}).address_line2,null);
  for(const patch of [{addressLine1:'<b>x</b>'},{city:''},{stateCode:'00'},{customerEmail:'not-an-email'},{customerName:'A'}]) assert.throws(()=>parseCustomer({...address,...patch}));
});
test('GST-inclusive tax uses price × rate/(100+rate) with exact half-up integer rounding',()=>{
  assert.equal(inclusiveTax(11800,1800),1800); // ₹118 at 18% contains ₹18
  assert.equal(inclusiveTax(10500,500),500);
  assert.equal(inclusiveTax(25000,300),728);   // 728.155… → 728
  assert.equal(inclusiveTax(103,300),3);       // 3.0 exactly
  assert.equal(inclusiveTax(35,1800),5);       // 5.338… → 5
  assert.equal(inclusiveTax(59,1800),9);       // 9.0 exactly
  assert.equal(inclusiveTax(649,1800),99);     // 98.99… → 99
  assert.equal(inclusiveTax(0,1800),0);assert.equal(inclusiveTax(25000,0),0);
});
test('GST split: same state → equal CGST + SGST halves; other state → IGST; taxable value conserves every paisa',()=>{
  const lines=[{product_id:id,quantity:1,unit_price:25000,line_discount_amount:0,hsn:'7117',gst_rate_bps:300},{product_id:id2,quantity:3,unit_price:10001,line_discount_amount:1,hsn:'9503',gst_rate_bps:1800}];
  const intra=gstBreakdown(lines,'29','29',true);
  assert.equal(intra.regime,'intra_state');assert.equal(intra.igst,0);
  assert.deepEqual(intra.lines.map(l=>[l.cgst,l.sgst,l.igst]),[[364,364,0],[2288,2288,0]]);
  const inter=gstBreakdown(lines,'32','29',true);
  assert.equal(inter.regime,'inter_state');assert.equal(inter.cgst+inter.sgst,0);
  assert.deepEqual(inter.lines.map(l=>l.igst),[728,4577]);
  for(const b of [intra,inter]) {
    for(const l of b.lines) assert.equal(l.taxable_value+l.cgst+l.sgst+l.igst,l.gross);
    assert.equal(b.total_tax,b.cgst+b.sgst+b.igst);assert.equal(b.taxable_value+b.total_tax,25000+30002);
    assert.equal(b.complete,true);
  }
  // Rounding: halves are rounded separately, so CGST always equals SGST (25000 at 3% → 364.08 each).
  assert.ok(Math.abs(intra.total_tax-inter.total_tax)<=1);
  const missing=gstBreakdown([{...lines[0],gst_rate_bps:null,hsn:null}],'29','29',false);
  assert.equal(missing.total_tax,0);assert.equal(missing.complete,false);assert.equal(missing.gst_registered,false);
});
test('snapshot carries per-line HSN and GST rate and a tax breakdown from the customer state vs seller state',()=>{
  const s=buildCheckoutSnapshot(request({stateCode:'32',items:[{productId:id,quantity:2}]}),[product],null,Date.now(),[],{sellerStateCode:'29',gstRegistered:false});
  assert.equal(s.lines[0].hsn,'7117');assert.equal(s.lines[0].gst_rate_bps,300);
  assert.equal(s.taxBreakdown.regime,'inter_state');assert.equal(s.taxBreakdown.igst,inclusiveTax(50000,300));
  const local=buildCheckoutSnapshot(request(),[product],null,Date.now(),[],{sellerStateCode:'29'});
  assert.equal(local.taxBreakdown.regime,'intra_state');assert.equal(local.taxBreakdown.place_of_supply,'29');
  // Prices are tax-inclusive: the amount charged never changes with tax.
  assert.equal(local.totalAmount,25000+4900);
  const invalid=buildCheckoutSnapshot(request(),[{...product,commerce:{storefronts:['general'],hsn:'12',gst_rate_bps:1750}}],null);
  assert.equal(invalid.lines[0].hsn,null);assert.equal(invalid.lines[0].gst_rate_bps,null);
  assert.equal(sellerStateCode({}),'29');assert.equal(sellerStateCode({SELLER_STATE_CODE:'32'}),'32');assert.throws(()=>sellerStateCode({SELLER_STATE_CODE:'99'}),/Seller tax/);
});
test('product admin stores HSN and GST rate (basis points) in commerce; invalid values are rejected',()=>{
  assert.deepEqual(validateCommerce({hsn:'711719',gst_rate_bps:1800}),{hsn:'711719',gst_rate_bps:1800});
  assert.deepEqual(validateCommerce({hsn:'',gst_rate_bps:null}),{});
  for(const bad of [{hsn:'71'},{hsn:'71171'},{hsn:'7117a'},{gst_rate_bps:18},{gst_rate_bps:1750},{gst_rate_bps:'1800'}]) assert.throws(()=>validateCommerce(bad),/HSN|GST/);
});

function createOrderRoute(env) {
  const module = { exports: {} };
  const forbidden = () => { throw new Error('Database or payment access must not occur'); };
  const source = ts.transpileModule(readFileSync(new URL('../../src/app/api/create-order/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { '@/lib/catalog-mode': catalogMode(env), 'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } }, '@/lib/supabase': { supabaseAdmin: { from: forbidden } }, '@/lib/commerce-db': { commerceTable: forbidden }, '@/lib/checkout-contract': contract, '@/lib/checkout-server': { razorpayRequest: forbidden } };
  new vm.Script(source).runInContext(vm.createContext({ module, exports: module.exports, process: { env }, crypto, require: id => deps[id] }));
  return module.exports.POST;
}
const post = body => ({ headers: new Headers(), text: async () => JSON.stringify(body) });
test('create-order rejects unserved states, missing terms and legacy free-text addresses before any database or provider access', async () => {
  const env = { ALLOWED_SHIPPING_STATES: '29,32', RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'fixture' };
  const base = { items: [{ productId: id, quantity: 1 }], storefront: 'general', ...address, acceptTerms: true };
  const unserved = await createOrderRoute(env)(post({ ...base, stateCode: '27' }));
  assert.equal(unserved.status, 422); assert.match(unserved.body.error, /We currently deliver to: Karnataka, Kerala/);
  const noTerms = await createOrderRoute(env)(post({ ...base, acceptTerms: false }));
  assert.equal(noTerms.status, 400); assert.match(noTerms.body.error, /Terms/);
  const legacy = await createOrderRoute(env)(post({ items: base.items, customerName: 'Test Buyer', customerEmail: 'test@example.invalid', customerPhone: '9999999999', shippingAddress: 'Fictional address only', acceptTerms: true }));
  assert.equal(legacy.status, 400); assert.match(legacy.body.error, /delivery address/);
  const catalogOnly = await createOrderRoute({ ...env, COMMERCE_CATALOG_ONLY: 'true' })(post(base));
  assert.equal(catalogOnly.status, 503); assert.match(catalogOnly.body.error, /Ordering is not open/);
});

import { isCatalogOnly } from '../../src/lib/catalog-mode.ts';
import { gstRegistered } from '../../src/lib/checkout-contract.ts';
test('catalogue-only mode: exactly "true" after trimming enables it; anything else keeps ordering open', () => {
  for (const value of ['true', ' true', 'true\n', '\ttrue ']) assert.equal(isCatalogOnly({ COMMERCE_CATALOG_ONLY: value }), true, JSON.stringify(value));
  for (const value of [undefined, '', 'TRUE', 'false', '1', 'yes', 't rue']) assert.equal(isCatalogOnly({ COMMERCE_CATALOG_ONLY: value }), false, JSON.stringify(value));
});
test('GST-registered sellers fail closed: unknown product GST rate or missing/invalid seller state blocks checkout', () => {
  const unrated = { ...product, commerce: { storefronts: ['general'] } };
  assert.throws(() => buildCheckoutSnapshot(request(), [unrated], null, Date.now(), [], { sellerStateCode: '29', gstRegistered: true }), error => error.status === 409 && /owner must set its GST rate/.test(error.message));
  assert.equal(buildCheckoutSnapshot(request(), [unrated], null, Date.now(), [], { sellerStateCode: '29', gstRegistered: false }).lines[0].gst_rate_bps, null);
  assert.equal(gstRegistered({ GST_REGISTERED: ' true ' }), true); assert.equal(gstRegistered({ GST_REGISTERED: 'yes' }), false);
  for (const env of [{ GST_REGISTERED: 'true' }, { GST_REGISTERED: 'true', SELLER_STATE_CODE: ' ' }, { GST_REGISTERED: 'true', SELLER_STATE_CODE: '99' }]) assert.throws(() => sellerStateCode(env), /SELLER_STATE_CODE/, JSON.stringify(env));
  assert.equal(sellerStateCode({ GST_REGISTERED: 'true', SELLER_STATE_CODE: '32' }), '32');
  assert.equal(sellerStateCode({ GST_REGISTERED: 'false' }), '29');
});
