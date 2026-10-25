import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { commerceTable } from "@/lib/commerce-db";
import { CheckoutError, assertCheckoutReady, parseAllowedPinPrefixes,buildCheckoutSnapshot, parseAllowedStates, parseCheckoutRequest, paymentConfiguration, record, sellerStateCode, gstRegistered, type CheckoutProduct, type CheckoutCoupon, type CheckoutCreator } from "@/lib/checkout-contract";
import { razorpayRequest } from "@/lib/checkout-server";
import { isCatalogOnly } from '@/lib/catalog-mode';
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deviceClass, placeFrom, sanitizeAttribution } from "@/lib/site-insights";

export async function POST(request: NextRequest) {
  if (isCatalogOnly()) return NextResponse.json({error:"The catalogue is open for browsing. Ordering is not open yet."},{status:503,headers:{"Cache-Control":"no-store"}});
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 40_000) throw new CheckoutError("Request is too large.",413);
    const raw = await request.text();
    if (raw.length > 40_000) throw new CheckoutError("Request is too large.",413);
    const json = JSON.parse(raw) as unknown;
    const body = parseCheckoutRequest(json);
    // Marketing source for owner insights only; it never affects price or validation, and a failure here never blocks checkout.
    let attribution: Record<string, unknown> | null = null;
    try {
      let cf: Record<string, unknown> | undefined;
      try { cf = getCloudflareContext().cf as Record<string, unknown> | undefined; } catch { cf = undefined; }
      const attributionInput = json && typeof json === "object" ? (json as Record<string, unknown>).attribution : null;
      attribution = {...(sanitizeAttribution(attributionInput) ?? sanitizeAttribution({})), device:deviceClass(request.headers.get("user-agent")), ...placeFrom(cf, request.headers.get("cf-ipcountry"))};
    } catch { attribution = null; }
    // Delivery address, served-state allow-list and terms acceptance are checked before any database or provider access.
    const customer = assertCheckoutReady(body,parseAllowedStates(process.env.ALLOWED_SHIPPING_STATES),parseAllowedPinPrefixes(process.env.ALLOWED_PIN_PREFIXES),parseAllowedPinPrefixes(process.env.SAME_DAY_PIN_PREFIXES));
    const sellerState = sellerStateCode(process.env);
    const config = paymentConfiguration(process.env);
    const ids = [...new Set(body.items.map(item => item.productId))];
    const {data:direct,error} = await supabaseAdmin.from(commerceTable("products")).select("id,name,price,stock,is_active,commerce,creator_id").in("id",ids);
    if (error || !direct) throw new CheckoutError("Catalog is temporarily unavailable. No payment has been taken.",503);
    // Combo components are priced, taxed and stocked from their own product records.
    const componentIds = [...new Set((direct as CheckoutProduct[]).flatMap(p => p.commerce?.combo?.components?.map(c => c.product_id) ?? []))].filter(id => !ids.includes(id));
    let products = direct as CheckoutProduct[];
    if (componentIds.length) {
      const result = await supabaseAdmin.from(commerceTable("products")).select("id,name,price,stock,is_active,commerce,creator_id").in("id",componentIds);
      if (result.error || !result.data) throw new CheckoutError("Catalog is temporarily unavailable. No payment has been taken.",503);
      products = [...products,...(result.data as CheckoutProduct[])];
    }
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
    const snapshot = buildCheckoutSnapshot(body,products,coupon,Date.now(),creators,{sellerStateCode:sellerState,gstRegistered:gstRegistered(process.env)});
    const id = crypto.randomUUID();
    // Persist authoritative merchandise, price and customer data BEFORE contacting Razorpay.
    const {error:saveError} = await supabaseAdmin.from(commerceTable("checkout_intents")).insert({id,storefront:body.storefront,items:snapshot.lines,subtotal:snapshot.subtotal,gift_charge:snapshot.giftCharge,shipping_charge:snapshot.shippingCharge,discount_amount:snapshot.discountAmount,total_amount:snapshot.totalAmount,currency:"INR",coupon_code:snapshot.couponCode,is_gift:body.isGift,gift_message:body.giftMessage,customer:{...customer,terms_accepted_at:new Date().toISOString()},tax_breakdown:snapshot.taxBreakdown,attribution,is_test:config.testMode,status:"created"});
    if (saveError) throw new CheckoutError("Secure checkout is unavailable. No payment has been taken.",503);
    const provider = record(await razorpayRequest("orders",{method:"POST",body:JSON.stringify({amount:snapshot.totalAmount,currency:"INR",receipt:id,notes:{checkout_intent_id:id,storefront:body.storefront}})}));
    if (typeof provider.id !== "string" || !/^order_\w+$/.test(provider.id) || provider.amount !== snapshot.totalAmount || provider.currency !== "INR") throw new CheckoutError("Payment provider returned an unexpected order. No payment has been taken.",502);
    const {error:bindError} = await supabaseAdmin.from(commerceTable("checkout_intents")).update({provider_order_id:provider.id,status:"awaiting_payment"}).eq("id",id).eq("status","created");
    if (bindError) throw new CheckoutError("Secure checkout could not be prepared. No payment has been taken.",503);
    return NextResponse.json({razorpayOrderId:provider.id,amount:snapshot.totalAmount,keyId:config.keyId,currency:"INR",subtotal:snapshot.subtotal,giftCharge:snapshot.giftCharge,shippingCharge:snapshot.shippingCharge,discountAmount:snapshot.discountAmount,packSaving:snapshot.packSaving,packs:snapshot.packs,couponCode:snapshot.couponCode,testMode:config.testMode},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    const known = error instanceof CheckoutError;
    return NextResponse.json({error:known ? error.message : "Invalid checkout request. Please try again."},{status:known ? error.status : 400});
  }
}
