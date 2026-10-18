import test from 'node:test';
import assert from 'node:assert/strict';
import { orderConfirmation, validOrderReference } from '../src/components/commerce/order-outcome.ts';

const order = {id:'ebfcb382-af42-41a3-b9db-351917f65797',status:'paid',storefront:'christmas',is_test:true,total_amount:25900,checkout_intent_id:'7a354259-8608-4894-9bbe-33a7fb0c630e'};
const evidence = {order_id:order.id,intent_id:order.checkout_intent_id,amount:25900,currency:'INR',status:'captured',is_test:true,provider_verified_at:'2026-10-16T10:30:00.000Z'};

test('missing or query-shaped orders never produce a confirmation', () => {
  for (const value of [null, undefined, {}, {paid:true,testMode:false}]) assert.equal(orderConfirmation(value, evidence, false), null);
});

test('historical paid status without matching capture remains unverified', () => {
  assert.equal(orderConfirmation(order, null, false).verified, false);
  assert.equal(orderConfirmation({...order,checkout_intent_id:null,is_test:null}, evidence, false).verified, false);
  for (const patch of [
    {order_id:'87ce6c5f-039a-41f0-ac19-cbcbaf704a00'}, {intent_id:'87ce6c5f-039a-41f0-ac19-cbcbaf704a00'},
    {amount:25899}, {currency:'USD'}, {is_test:false}, {status:'authorized'}, {provider_verified_at:null}, {provider_verified_at:'invalid'}
  ]) assert.equal(orderConfirmation(order,{...evidence,...patch},false).verified,false);
});

test('verified confirmation requires matching recorded capture and payment mode', () => {
  assert.deepEqual(orderConfirmation(order,evidence,false),{storefront:'christmas',testMode:true,verified:true});
  assert.deepEqual(orderConfirmation({...order,storefront:'general',is_test:false},{...evidence,is_test:false},false),{storefront:'general',testMode:false,verified:true});
  assert.equal(orderConfirmation({...order,is_test:false},{...evidence,is_test:false},true).verified,false);
  assert.equal(orderConfirmation({...order,status:'pending'},evidence,false).verified,false);
  assert.equal(orderConfirmation({...order,storefront:'third-store'},evidence,false),null);
});

test('only complete UUID references may reach the server order lookup', () => {
  assert.equal(validOrderReference(order.id), true);
  for (const value of [undefined, '', 'paid', 'ebfcb382', "' OR 1=1", [order.id]]) assert.equal(validOrderReference(value), false);
});
