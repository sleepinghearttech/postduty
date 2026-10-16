import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import { requireOwner } from '@/lib/commerce-auth';
import type { NextRequest } from 'next/server';
import { businessRange, indiaDay, summarizeBusiness, type BusinessRange, type BusinessOrder, type BusinessItem, type PaymentEvidence, type BusinessProduct, type ResearchInsight } from './metrics';
import { businessProjections, missingColumn } from './queries';
import { buildAttentionQueue, type OrphanCapture, type ProblemIntent, type NotificationIssue, type AttentionOrder } from './attention';

type Operation = { product_id:string; details:Record<string,unknown> };
type Settlement = { id:string; creator_id:string; amount_paise:number; status:string; created_at:string };
type Creator = { id:string; display_name:string; status:string };
type Fulfillment = { id:string; fulfillment_status:string; order_id:string; creator_id:string|null };
type QueryFilter={column:string;op:'eq'|'is'|'in';value:string|null|readonly string[]};
async function readRows<T>(table:string, projection:string|readonly string[], range?:BusinessRange, dateColumn='created_at',filters:QueryFilter[]=[]):Promise<{rows:T[];unavailable:boolean;truncated:boolean;legacy:boolean}> {
  const [columns,...fallbacks]=typeof projection==='string'?[projection]:projection;
  let query = supabaseAdmin.from(commerceTable(table)).select(columns,{count:'exact'}).limit(1000);
  if(range) query=query.gte(dateColumn,range.previousStart).lt(dateColumn,range.end);
  for(const filter of filters){
    if(filter.op==='in')query=query.in(filter.column,filter.value as readonly string[]);
    else if(filter.op==='is')query=query.is(filter.column,null);
    else query=query.eq(filter.column,filter.value);
  }
  const result=await query;
  if(result.error && fallbacks.length && missingColumn(result.error)) {
    const older=await readRows<T>(table,fallbacks,range,dateColumn,filters);
    return {...older,legacy:true};
  }
  if(result.error) return {rows:[],unavailable:true,truncated:false,legacy:false};
  // Never present partial aggregations as a full period total.
  if ((result.count ?? 0) > 1000) return {rows:[],unavailable:false,truncated:true,legacy:false};
  return {rows:(result.data ?? []) as T[],unavailable:false,truncated:false,legacy:false};
}
export async function loadBusiness(range:BusinessRange, requestedMode?:string, request?:NextRequest) {
  if (!await requireOwner(request)) throw new Error('Unauthorized');
  const sandbox=isCommerceSandbox(); const mode=requestedMode==='test'||sandbox ? 'test' : 'live';
  const today=businessRange(indiaDay(),indiaDay());
  const [orders,items,products,operations,settlements,creators,fulfillments,research,todayOrders,orphanCaptures,problemIntents,notificationIssues] = await Promise.all([
    readRows<BusinessOrder>('orders',businessProjections.orders,range),
    readRows<BusinessItem>('order_items',businessProjections.items,range),
    readRows<BusinessProduct>('products',businessProjections.products),
    readRows<Operation>('product_operations','product_id,details'),
    readRows<Settlement>('settlements','id,creator_id,amount_paise,status,created_at'),
    readRows<Creator>('creators','id,display_name,status'),
    readRows<Fulfillment>('order_items','id,fulfillment_status,order_id,creator_id'),
    readRows<ResearchInsight>('research_insights','id,title,finding,source_url,researched_at,confidence,expected_benefit,effort,risks,next_action,product_id,status,evidence_type,created_at'),
    supabaseAdmin.from(commerceTable('orders')).select('id',{count:'exact',head:true}).gte('created_at',today.start).lt('created_at',today.end),
    readRows<OrphanCapture>('checkout_payments','provider_payment_id,intent_id,order_id,amount,currency,is_test,provider_verified_at,reason',undefined,'created_at',[{column:'order_id',op:'is',value:null},{column:'status',op:'eq',value:'captured'}]),
    readRows<ProblemIntent>('checkout_intents','id,status,reconciliation_reason,is_test,total_amount,currency,storefront,updated_at',undefined,'created_at',[{column:'status',op:'in',value:['reconciliation_required','awaiting_customer']}]),
    readRows<NotificationIssue>('payment_notification_jobs','order_id,status,created_at,attempted_at',undefined,'created_at',[{column:'status',op:'in',value:['failed','attempted_unconfirmed']}]),
  ]);
  const notificationOrders=notificationIssues.rows.length?await readRows<AttentionOrder>('orders',['id,is_test,payment_mode','id,is_test','id'],undefined,'created_at',[{column:'id',op:'in',value:notificationIssues.rows.map(j=>j.order_id)}]):{rows:[] as AttentionOrder[],unavailable:false,truncated:false,legacy:false};
  // Join proof by order, rather than filtering capture date: reconciliation may create an order later.
  const chunks=Array.from({length:Math.ceil(orders.rows.length/100)},(_,i)=>orders.rows.slice(i*100,(i+1)*100).map(o=>o.id));
  const paymentResults=await Promise.all((chunks.length?chunks:[[]]).map(ids=>{
    const query=supabaseAdmin.from(commerceTable('checkout_payments')).select('order_id,status,provider_verified_at,amount,currency,is_test');
    return ids.length?query.in('order_id',ids):query.limit(0);
  }));
  const payments={rows:paymentResults.flatMap(r=>(r.data??[]) as PaymentEvidence[]),unavailable:paymentResults.some(r=>!!r.error),truncated:false,legacy:false};
  const sources={orders,items,payments,products,operations,settlements,creators,fulfillments,research,orphanCaptures,problemIntents,notificationIssues,notificationOrders};
  const warnings=Object.entries(sources).flatMap(([name,value])=>value.unavailable?[`${name}: not available in this environment.`]:value.truncated?[`${name}: more than 1,000 records. Narrow the date range; totals withheld.`]:value.legacy?[`${name}: historical schema has limited evidence.`]:[]);
  const financialAvailable=!orders.unavailable&&!orders.truncated&&!payments.unavailable&&!payments.truncated;
  const summary=summarizeBusiness(orders.rows,items.rows,payments.rows,products.rows,range,mode);
  const activeProducts=products.rows.filter(p=>!p.commerce?.archived);
  return {range,mode,sandbox,summary,financialAvailable,warnings,todayOrders:todayOrders.error?null:todayOrders.count,
    attention:buildAttentionQueue(orphanCaptures.rows,problemIntents.rows,notificationIssues.rows,notificationOrders.rows),
    attentionAvailable:[orphanCaptures,problemIntents,notificationIssues,notificationOrders].every(s=>!s.unavailable&&!s.truncated),
    products:activeProducts,operations:operations.rows,
    lowStock:activeProducts.filter(p=>p.is_active&&(p.commerce?.variants?.length?p.commerce.variants.reduce((s,v)=>s+v.stock,0):p.stock)<=(p.commerce?.low_stock_threshold??3)),
    drafts:activeProducts.filter(p=>!p.is_active),
    settlements:settlements.rows,creators:creators.rows,
    awaitingAcceptance:fulfillments.rows.filter(f=>f.creator_id&&f.fulfillment_status==='awaiting_acceptance').length,
    readyToDispatch:fulfillments.rows.filter(f=>f.creator_id&&f.fulfillment_status==='ready').length,
    research:research.rows.sort((a,b)=>b.researched_at.localeCompare(a.researched_at)),
    availability:Object.fromEntries(Object.entries(sources).map(([name,value])=>[name,!value.unavailable&&!value.truncated])),
  };
}
export type BusinessData = Awaited<ReturnType<typeof loadBusiness>>;
