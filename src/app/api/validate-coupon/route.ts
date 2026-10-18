import { commerceTable } from '@/lib/commerce-db';
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { couponDiscount, type CheckoutCoupon } from "@/lib/checkout-contract";

const amount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 50_000_000 ? value : null;

/**
 * Cart preview only: the same rule as checkout (couponDiscount). Checkout recomputes from server prices,
 * so a preview can never change the amount charged.
 * Body: { code, subtotal, giftCharge } in paise. Legacy { cartTotal } is treated as merchandise only.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { code?: unknown; subtotal?: unknown; giftCharge?: unknown; cartTotal?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || code.length > 40 || /[<>\x00-\x1F]/.test(code)) {
    return NextResponse.json({ valid: false, message: "Please enter a coupon code." }, { status: 400 });
  }
  const subtotal = amount(body?.subtotal) ?? amount(body?.cartTotal);
  const giftCharge = amount(body?.giftCharge) ?? 0;
  if (subtotal === null) return NextResponse.json({ valid: false, message: "Your bag total could not be read. Please refresh." }, { status: 400 });

  const { data: coupon, error } = await supabaseAdmin.from(commerceTable('coupons')).select("*").eq("code", code).maybeSingle();
  if (error) return NextResponse.json({ valid: false, message: "Coupons are temporarily unavailable." }, { status: 503 });

  const result = couponDiscount(coupon as CheckoutCoupon | null, subtotal, giftCharge);
  if (!result.ok) return NextResponse.json({ valid: false, message: result.message });
  const c = coupon as CheckoutCoupon;
  return NextResponse.json({
    valid: true,
    discountType: c.discount_type,
    discountValue: c.discount_value,
    discountAmount: result.discount,
    message: `Coupon applied! ${result.label}`,
  });
}
