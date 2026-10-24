import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { commerceTable, isCommerceSandbox } from "@/lib/commerce-db";
import { CheckoutError, assertCapturedPayment, paymentConfiguration, type CheckoutCustomer } from "@/lib/checkout-contract";
import { sendAdminWhatsAppAlert, sendCreatorWhatsAppAlerts, sendCustomerWhatsAppConfirmation, type CreatorAlertLine } from "@/lib/notifications";
import { sendCreatorOrderEmails, sendOrderEmails, type CreatorRecipient } from "@/lib/email";
import type { Order, OrderLineSummary } from "@/lib/types";

export async function razorpayRequest(path: string, init: RequestInit = {}) {
  const config = paymentConfiguration(process.env);
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, { ...init, headers: {"Content-Type":"application/json",Authorization:`Basic ${Buffer.from(`${config.keyId}:${config.secret}`).toString("base64")}`}, cache:"no-store", signal:AbortSignal.timeout(15000) });
  } catch { throw new CheckoutError("Payment provider is temporarily unavailable. Please retry safely.",502); }
  if (!response.ok) throw new CheckoutError("Payment provider could not complete this request. Please retry safely.",502);
  return response.json() as Promise<unknown>;
}

type Intent = {id:string;provider_order_id:string;total_amount:number;currency:string;is_test:boolean;customer:CheckoutCustomer|null};
type FinalizeResult = {status:"confirmed"|"reconciliation_required"|"awaiting_customer"; order_id?:string; created?:boolean; reason?:string};

/** Client and webhook converge here; only the database transaction writes paid orders. */
export async function verifyAndFinalize(orderId: string, paymentId: string, customer:CheckoutCustomer|null = null): Promise<FinalizeResult> {
  const config = paymentConfiguration(process.env);
  if (!/^order_[\w]+$/.test(orderId) || !/^pay_[\w]+$/.test(paymentId)) throw new CheckoutError("Invalid payment reference.");
  const {data,error} = await supabaseAdmin.from(commerceTable("checkout_intents")).select("id,provider_order_id,total_amount,currency,is_test,customer").eq("provider_order_id",orderId).maybeSingle();
  if (error) throw new CheckoutError("Order verification is temporarily unavailable. Retain your payment reference.",503);
  if (!data) throw new CheckoutError("This payment needs manual review because no secure checkout record was found.",409);
  const intent = data as Intent;
  if (intent.is_test !== config.testMode) throw new CheckoutError("Payment environment does not match the checkout.",409);
  const payment = assertCapturedPayment(await razorpayRequest(`payments/${paymentId}`),{paymentId,orderId,amount:intent.total_amount,currency:intent.currency});
  // Preserve provider-verified capture evidence even if finalization later rolls back.
  // These immutable bindings never come from client totals/items or webhook notes.
  const {error:captureError} = await supabaseAdmin.from(commerceTable("checkout_payments")).upsert({provider_payment_id:payment.id,provider_order_id:payment.order_id,intent_id:intent.id,amount:payment.amount,currency:payment.currency,is_test:config.testMode},{onConflict:"provider_payment_id",ignoreDuplicates:true});
  if (captureError) throw new CheckoutError("Captured payment needs reconciliation. Retain your payment reference.",503);
  const {data:result,error:finalizeError} = await supabaseAdmin.rpc(commerceTable("finalize_checkout_payment"),{p_intent_id:intent.id,p_payment_id:payment.id,p_provider_order_id:payment.order_id,p_amount:payment.amount,p_currency:payment.currency,p_test_mode:config.testMode,p_customer:intent.customer ? null : customer});
  if (finalizeError || !result) {
    await supabaseAdmin.from(commerceTable("checkout_payments")).update({reason:"finalization_failed"}).eq("intent_id",intent.id).is("order_id",null);
    throw new CheckoutError("Payment verification needs reconciliation. Retain your payment reference and contact support.",503);
  }
  const final = result as FinalizeResult;
  if (final.status === "confirmed" && final.created && final.order_id) await notifyNewOrder(final.order_id,config.testMode).catch(() => { /* Outbox remains visible; notifications must not invalidate a paid order. */ });
  return final;
}

async function notifyNewOrder(orderId:string,testMode:boolean) {
  // A database outbox entry exists even if the process dies before notification handling.
  // Test transactions must never send real email or WhatsApp, independent of notification flags.
  if (testMode || isCommerceSandbox() || process.env.ORDER_NOTIFICATIONS_ENABLED !== "true") return;
  const {data:claimed,error} = await supabaseAdmin.from(commerceTable("payment_notification_jobs")).update({status:"attempting",attempted_at:new Date().toISOString()}).eq("order_id",orderId).eq("status","pending").select("order_id").maybeSingle();
  if (error || !claimed) return;
  const {data:order} = await supabaseAdmin.from(commerceTable("orders")).select("*").eq("id",orderId).single();
  if (!order) return;
  // Owner alerts list each line's option and personalisation; customer messages are unchanged.
  const {data:lines} = await supabaseAdmin.from(commerceTable("order_items")).select("product_name,quantity,variant_id,variant_name,personalization,creator_id,combo_role").eq("order_id",orderId);
  const alertOrder = {...(order as Order),order_items:(lines ?? []) as OrderLineSummary[]};
  // Creators make component lines, not the priced combo parent.
  const creatorLines = ((lines ?? []) as (CreatorAlertLine & {combo_role?: string|null})[]).filter(line => line.combo_role !== "combo");
  const creatorIds = [...new Set(creatorLines.flatMap(line => line.creator_id ? [line.creator_id] : []))];
  // A failed creator lookup only skips creator emails; owner and customer alerts still go out.
  let creatorRecipients: CreatorRecipient[] = [];
  if (creatorIds.length) {
    try {
      const {data:creatorRows,error:creatorError} = await supabaseAdmin.from(commerceTable("creators")).select("id,email,display_name,status").in("id",creatorIds);
      if (creatorError) console.error("[Email] Creator lookup failed; creator emails skipped:", creatorError.message);
      creatorRecipients = ((creatorRows ?? []) as (CreatorRecipient & {status?:string})[]).filter(c => c.status !== "suspended");
    } catch (err) { console.error("[Email] Creator lookup error; creator emails skipped:", err); }
  }
  const results = await Promise.allSettled([sendAdminWhatsAppAlert(alertOrder),sendCreatorWhatsAppAlerts(order as Order,creatorLines),sendCreatorOrderEmails(order as Order,creatorLines,creatorRecipients),sendCustomerWhatsAppConfirmation(order as Order),sendOrderEmails(alertOrder)]);
  // Existing transports swallow provider errors; do not mislabel an attempt as delivery.
  await supabaseAdmin.from(commerceTable("payment_notification_jobs")).update({status:results.some(r => r.status === "rejected") ? "failed" : "attempted_unconfirmed"}).eq("order_id",orderId);
}
