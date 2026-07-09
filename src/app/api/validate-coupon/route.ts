import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Coupon } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json() as { code?: string; cartTotal?: number };

  const code = body.code?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ valid: false, message: "Please enter a coupon code." }, { status: 400 });
  }

  const cartTotal = body.cartTotal ?? 0; // paise

  // Look up the coupon
  const { data: coupon, error } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .single();

  if (error || !coupon) {
    return NextResponse.json({ valid: false, message: "Invalid coupon code." });
  }

  const c = coupon as Coupon;

  // Check active
  if (!c.is_active) {
    return NextResponse.json({ valid: false, message: "This coupon is no longer active." });
  }

  // Check expiry
  if (c.expires_at && new Date(c.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, message: "This coupon has expired." });
  }

  // Check usage limit
  if (c.max_uses !== null && c.times_used >= c.max_uses) {
    return NextResponse.json({ valid: false, message: "This coupon has reached its usage limit." });
  }

  // Check minimum order
  if (cartTotal < c.min_order) {
    const minInRupees = (c.min_order / 100).toFixed(0);
    return NextResponse.json({
      valid: false,
      message: `Minimum order of ₹${minInRupees} required for this coupon.`,
    });
  }

  // Calculate discount
  let discountAmount = 0;
  if (c.discount_type === "percent") {
    discountAmount = Math.round(cartTotal * c.discount_value / 100);
  } else {
    // flat discount in paise
    discountAmount = c.discount_value;
  }

  // Cap discount at cart total (never go negative)
  discountAmount = Math.min(discountAmount, cartTotal);

  const discountLabel =
    c.discount_type === "percent"
      ? `${c.discount_value}% off`
      : `₹${(c.discount_value / 100).toFixed(0)} off`;

  return NextResponse.json({
    valid: true,
    discountType: c.discount_type,
    discountValue: c.discount_value,
    discountAmount,
    message: `Coupon applied! ${discountLabel}`,
  });
}
