import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { productId, quantity } = await request.json() as { productId: string; quantity: number };

  if (!productId || !quantity || quantity < 1) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Use anon client for reads — SELECT is granted to anon, RLS enforces is_active = true
  const { data: product, error } = await supabase
    .from("products")
    .select("id, price, stock, is_active")
    .eq("id", productId)
    .single();

  if (error || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.is_active) {
    return NextResponse.json({ error: "Product is not available" }, { status: 400 });
  }

  if (product.stock < quantity) {
    return NextResponse.json({ error: "Not enough stock" }, { status: 400 });
  }

  const amount = product.price * quantity; // paise

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
        amount,
        currency: "INR",
        receipt: `rcpt_${productId.slice(0, 8)}_${Date.now()}`,
        // Razorpay copies order notes to the payment entity, making them
        // available in webhooks. Storing productId + quantity here enables
        // full order recovery if the frontend verify-payment call fails.
        // Only non-PII fields go here — customer details aren't known yet
        // (the customer fills the form after this API call) and shipping
        // addresses don't belong in a payment processor's data store.
        notes: {
          productId,
          quantity: String(quantity),
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
  });
}
