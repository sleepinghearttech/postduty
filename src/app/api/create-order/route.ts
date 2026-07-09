import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import type { Coupon } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    productId?: string;
    quantity?: number;
    items?: Array<{ productId: string; quantity: number }>;
    couponCode?: string;
    isGift?: boolean;
    giftMessage?: string;
  };

  let items: Array<{ productId: string; quantity: number }> = [];

  if (body.items && Array.isArray(body.items)) {
    items = body.items;
  } else if (body.productId && body.quantity) {
    items = [{ productId: body.productId, quantity: body.quantity }];
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Invalid request. No items provided." }, { status: 400 });
  }

  // Validate quantities
  for (const item of items) {
    if (!item.productId || !item.quantity || item.quantity < 1) {
      return NextResponse.json({ error: "Invalid request. Item quantities must be at least 1." }, { status: 400 });
    }
  }

  const productIds = items.map(item => item.productId);

  // Fetch all products in the cart
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, price, stock, is_active")
    .in("id", productIds);

  if (error || !products || products.length !== productIds.length) {
    return NextResponse.json({ error: "One or more products not found" }, { status: 404 });
  }

  // Verify active and stock, calculate subtotal
  let subtotal = 0; // paise
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      return NextResponse.json({ error: "Product mismatch" }, { status: 400 });
    }
    if (!product.is_active) {
      return NextResponse.json({ error: `Product "${product.name}" is no longer available` }, { status: 400 });
    }
    if (product.stock < item.quantity) {
      return NextResponse.json({ error: `Not enough stock for "${product.name}"` }, { status: 400 });
    }
    subtotal += product.price * item.quantity;
  }

  // Gift option: add ₹20 (2000 paise) for greeting card
  const isGift = body.isGift === true;
  const giftCharge = isGift ? 2000 : 0;

  // Coupon validation (server-side, never trust client discount)
  let discountAmount = 0;
  let couponCode: string | null = null;
  if (body.couponCode) {
    const code = body.couponCode.trim().toUpperCase();
    const { data: coupon } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("code", code)
      .single();

    if (coupon) {
      const c = coupon as Coupon;
      const cartForCoupon = subtotal + giftCharge; // gift charge counts toward minimum
      const isValid =
        c.is_active &&
        (!c.expires_at || new Date(c.expires_at) >= new Date()) &&
        (c.max_uses === null || c.times_used < c.max_uses) &&
        cartForCoupon >= c.min_order;

      if (isValid) {
        if (c.discount_type === "percent") {
          discountAmount = Math.round(subtotal * c.discount_value / 100);
        } else {
          discountAmount = c.discount_value;
        }
        discountAmount = Math.min(discountAmount, subtotal); // never discount more than product cost
        couponCode = code;
      }
    }
    // Silently ignore invalid coupons — the frontend already validated and showed the user
  }

  const totalAmount = subtotal + giftCharge - discountAmount;

  // Create order on Razorpay using fetch — no SDK needed
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const credentials = btoa(`${keyId}:${keySecret}`);

  let rzpRes: Response;
  try {
    rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount: totalAmount,
        currency: "INR",
        receipt: `rcpt_${items[0].productId.slice(0, 8)}_${Date.now()}`,
        // Serialize all order metadata in Razorpay notes for webhook recovery
        notes: {
          items: JSON.stringify(items.map(item => ({ productId: item.productId, quantity: item.quantity }))),
          couponCode: couponCode || "",
          discountAmount: String(discountAmount),
          isGift: String(isGift),
          giftMessage: body.giftMessage || "",
        },
      }),
    });
  } catch (fetchErr) {
    console.error("[create-order] fetch threw:", fetchErr);
    return NextResponse.json({ error: "Payment system error" }, { status: 500 });
  }

  if (!rzpRes.ok) {
    const body = await rzpRes.text().catch(() => "(unreadable)");
    console.error("[create-order] Razorpay non-OK:", rzpRes.status, body);
    return NextResponse.json({ error: "Payment system error" }, { status: 500 });
  }

  const rzpOrder = await rzpRes.json() as { id: string; amount: number };

  return NextResponse.json({
    razorpayOrderId: rzpOrder.id,
    amount: rzpOrder.amount,
    keyId, // safe to send — this is the publishable key, not the secret
    discountAmount, // tell the frontend what discount was applied
    couponCode, // echo back the applied code
  });
}
