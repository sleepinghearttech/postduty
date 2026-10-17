export type OrphanCapture={provider_payment_id:string;intent_id:string;order_id:null;amount:number;currency:string;is_test:boolean;provider_verified_at:string;reason:string|null};
export type ProblemIntent={id:string;status:string;reconciliation_reason:string|null;is_test:boolean;total_amount:number;currency:string;storefront:string;updated_at:string};
export type NotificationIssue={order_id:string;status:string;created_at:string;attempted_at:string|null};
export type AttentionOrder={id:string;is_test?:boolean;payment_mode?:string|null};
export type AttentionItem={id:string;kind:'payment'|'checkout'|'notification';title:string;status:string;reference:string;mode:'test'|'live'|'unknown';amount:number|null;currency:string|null;at:string;detail:string;action:string};

const reasons:Record<string,string>={
  customer_details_required:'Customer details are still required to create the order.',
  inventory_unavailable:'Captured payment could not be converted to an order because stock was unavailable.',
  coupon_capacity_reached:'The discount reached its usage limit before the order could be completed.',
  product_unavailable:'A product is no longer available for this checkout.',
  variant_unavailable:'A selected product option is no longer available.',
  creator_unavailable:'The assigned creator is no longer available.',
};
function reasonText(reason:string|null|undefined){return reason?reasons[reason]??'A reconciliation issue was recorded. Check the payment record before taking action.':'Order creation is incomplete. Check the payment record before taking action.';}
/** No customer fields or raw provider error strings enter this view. */
export function buildAttentionQueue(captures:OrphanCapture[],intents:ProblemIntent[],jobs:NotificationIssue[],orders:AttentionOrder[]):AttentionItem[]{
  const entries:AttentionItem[]=[];const capturedIntents=new Set(captures.map(c=>c.intent_id));
  for(const capture of captures){
    const intent=intents.find(i=>i.id===capture.intent_id);
    entries.push({id:`payment:${capture.provider_payment_id}`,kind:'payment',title:'Payment captured · order not created',status:intent?.status??'reconciliation_required',reference:capture.provider_payment_id,mode:capture.is_test?'test':'live',amount:capture.amount,currency:capture.currency,at:capture.provider_verified_at,detail:reasonText(capture.reason??intent?.reconciliation_reason),action:'Match the capture in Razorpay and review the checkout issue. Do not charge again. Any refund or order correction requires owner approval.'});
  }
  for(const intent of intents){if(capturedIntents.has(intent.id))continue;entries.push({id:`checkout:${intent.id}`,kind:'checkout',title:intent.status==='awaiting_customer'?'Checkout needs customer details':'Checkout needs reconciliation',status:intent.status,reference:intent.id,mode:intent.is_test?'test':'live',amount:null,currency:null,at:intent.updated_at,detail:reasonText(intent.reconciliation_reason),action:'Check the provider record and order history first. This status alone does not establish a captured payment.'});}
  for(const job of jobs){const order=orders.find(o=>o.id===job.order_id);const mode=order?.is_test===true&&order.payment_mode!=='live'?'test':order?.is_test===false&&order.payment_mode==='live'?'live':'unknown';entries.push({id:`notification:${job.order_id}`,kind:'notification',title:job.status==='failed'?'Notification attempt failed':'Notification delivery not confirmed',status:job.status,reference:job.order_id,mode,amount:null,currency:null,at:job.attempted_at??job.created_at,detail:'An attempt record is not evidence that a customer received the message.',action:'Review delivery-provider logs before deciding on customer contact. This queue does not resend messages.'});}
  return entries.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
}
