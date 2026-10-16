import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { commerceTable } from "@/lib/commerce-db";
import { CheckoutError, buildCheckoutSnapshot, parseCheckoutRequest, paymentConfiguration, record, type CheckoutProduct, type CheckoutCoupon, type CheckoutCreator } from "@/lib/checkout-contract";
import { razorpayRequest } from "@/lib/checkout-server";

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 40_000) throw new CheckoutError("Request is too large.",413);
    const raw = await request.text();
    if (raw.length > 40_000) throw new CheckoutError("Request is too large.",413);
    const body = parseCheckoutRequest(JSON.parse(raw));
    const config = paymentConfiguration(process.env);
    const ids = [...new Set(body.items.map(item => item.productId))];
    const {data:products,error} = await supabaseAdmin.from(commerceTable("products")).select("id,name,price,stock,is_active,commerce,creator_id").in("id",ids);
    if (error || !products) throw new CheckoutError("Catalog is temporarily unavailable. No payment has been taken.",503);
    let coupon:CheckoutCoupon|null = null;
    if (body.couponCode) {
      const result = await supabaseAdmin.from(commerceTable("coupons")).select("*").eq("code",body.couponCode).maybeSingle();
      if (result.error) throw new CheckoutError("Coupon validation is temporarily unavailable.",503);
      coupon = result.data as CheckoutCoupon|null;
    }
    const creatorIds = [...new Set(products.flatMap(p => p.creator_id ? [String(p.creator_id)] : []))];
    let creators:CheckoutCreator[] = [];
    if (creatorIds.length) {
      const result = await supabaseAdmin.from(commerceTable("creators")).select("id,status,commission_bps").in("id",creatorIds);
      if (result.error) throw new CheckoutError("Creator availability is temporarily unavailable. No payment has been taken.",503);
      creators = (result.data ?? []) as CheckoutCreator[];
    }
    const snapshot = buildCheckoutSnapshot(body,products as CheckoutProduct[],coupon,Date.now(),creators);
    const id = crypto.randomUUID();
    // Persist authoritative merchandise, price and customer data BEFORE contacting Razorpay.
    const {error:saveError} = await supabaseAdmin.from(commerceTable("checkout_intents")).insert({id,storefront:body.storefront,items:snapshot.lines,subtotal:snapshot.subtotal,gift_charge:snapshot.giftCharge,discount_amount:snapshot.discountAmount,total_amount:snapshot.totalAmount,currency:"INR",coupon_code:snapshot.couponCode,is_gift:body.isGift,gift_message:body.giftMessage,customer:body.customer,is_test:config.testMode,status:"created"});
    if (saveError) throw new CheckoutError("Secure checkout is unavailable. No payment has been taken.",503);
    const provider = record(await razorpayRequest("orders",{method:"POST",body:JSON.stringify({amount:snapshot.totalAmount,currency:"INR",receipt:id,notes:{checkout_intent_id:id,storefront:body.storefront}})}));
    if (typeof provider.id !== "string" || !/^order_\w+$/.test(provider.id) || provider.amount !== snapshot.totalAmount || provider.currency !== "INR") throw new CheckoutError("Payment provider returned an unexpected order. No payment has been taken.",502);
    const {error:bindError} = await supabaseAdmin.from(commerceTable("checkout_intents")).update({provider_order_id:provider.id,status:"awaiting_payment"}).eq("id",id).eq("status","created");
    if (bindError) throw new CheckoutError("Secure checkout could not be prepared. No payment has been taken.",503);
    return NextResponse.json({razorpayOrderId:provider.id,amount:snapshot.totalAmount,keyId:config.keyId,currency:"INR",discountAmount:snapshot.discountAmount,couponCode:snapshot.couponCode,testMode:config.testMode},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    const known = error instanceof CheckoutError;
    return NextResponse.json({error:known ? error.message : "Invalid checkout request. Please try again."},{status:known ? error.status : 400});
  }
}
