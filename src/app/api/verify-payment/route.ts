import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

function computeExpectedSignature(orderId: string, paymentId: string, secret: string): string {
  return createHmac("sha256", secret.trim())
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  // Razorpay webhooks include this header; checkout calls do not.
  const webhookSig = request.headers.get("x-razorpay-signature");
  if (webhookSig !== null) {
    return handleRazorpayWebhook(request, webhookSig);
  }

  // ── Checkout verification path ─────────────────────────────────────────
  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    productId,
    quantity,
    unitPrice,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    totalAmount,
  } = await request.json() as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddress: string;
    totalAmount: number;
  };

  // Step 1 — verify the payment signature is genuine
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const expectedSignature = computeExpectedSignature(razorpayOrderId, razorpayPaymentId, secret);
  const valid = expectedSignature === razorpaySignature;

  if (!valid) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // Step 2 — save order to database
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      shipping_address: shippingAddress,
      total_amount: totalAmount,
      status: "paid",
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("Failed to save order:", orderError?.message);
    await supabaseAdmin.from("failed_order_logs").insert({
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      amount: totalAmount,
      customer_email: customerEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
      raw_payload: {
        razorpayOrderId, razorpayPaymentId, productId, quantity,
        unitPrice, customerName, customerEmail, customerPhone,
        shippingAddress, totalAmount,
      },
    });
    return NextResponse.json(
      { error: `Payment received but order could not be saved. Please contact hello@postduty.in with your payment ID: ${razorpayPaymentId}` },
      { status: 500 }
    );
  }

  // Step 3 — save order line item
  const { error: itemError } = await supabaseAdmin.from("order_items").insert({
    order_id: order.id,
    product_id: productId,
    quantity,
    unit_price: unitPrice,
  });

  if (itemError) {
    console.error("Failed to save order item:", itemError.message);
  }

  // Step 4 — decrement stock
  const { data: current } = await supabaseAdmin
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single();

  if (current) {
    await supabaseAdmin
      .from("products")
      .update({ stock: Math.max(0, current.stock - quantity) })
      .eq("id", productId);
  }

  return NextResponse.json({ success: true, orderId: order.id });
}

// ── Webhook handler ────────────────────────────────────────────────────────

type RazorpayWebhookEvent = {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        email: string;
        contact: string;
      };
    };
  };
};

async function handleRazorpayWebhook(
  request: NextRequest,
  signature: string
): Promise<NextResponse> {
  // Must read as raw text before any parsing. The HMAC is computed over the
  // exact bytes Razorpay sent. Calling request.json() would re-serialise the
  // parsed object, potentially changing whitespace or key order, producing a
  // different hash even when the payload is legitimate.
  const rawBody = await request.text();

  // Webhook signature uses RAZORPAY_WEBHOOK_SECRET, not RAZORPAY_KEY_SECRET.
  // The checkout signature proves the Razorpay SDK signed the payment result.
  // The webhook signature proves the HTTP request came from Razorpay servers,
  // not from an attacker POSTing a crafted payload to our endpoint.
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  if (expected !== signature) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as RazorpayWebhookEvent;

  // Razorpay may send other event types to this URL if more are enabled later.
  if (event.event !== "payment.captured") {
    return NextResponse.json({ received: true });
  }

  const payment = event.payload.payment.entity;

  // Idempotency: the UNIQUE constraint on razorpay_payment_id means the
  // frontend checkout path may have already created this order. If so, return
  // 200 so Razorpay stops retrying — there is nothing to do.
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("razorpay_payment_id", payment.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  // Recovery case: payment was captured but the customer's browser never
  // completed the frontend verify-payment call (tab closed, network drop, etc.).
  // The webhook payload contains: payment ID, order ID, amount, email, phone.
  // It does NOT contain: customer name, shipping address, or product details —
  // those were never stored in Razorpay notes (create-order doesn't set them).
  // Creating a partial order record would appear broken in the admin panel
  // (no items, no address). Instead, log to failed_order_logs so the admin
  // can manually recover using the full payload and the Razorpay dashboard.
  await supabaseAdmin.from("failed_order_logs").insert({
    razorpay_payment_id: payment.id,
    razorpay_order_id: payment.order_id,
    amount: payment.amount,
    customer_email: payment.email,
    customer_name: null,
    customer_phone: payment.contact,
    raw_payload: event,
  });

  console.warn(
    "Webhook recovery: payment captured but no order in DB. Logged to failed_order_logs.",
    payment.id
  );

  // Return 200 so Razorpay does not retry. The payment is safe — it's in
  // Razorpay's system and now in our failed_order_logs for manual recovery.
  return NextResponse.json({ received: true, status: "logged_for_recovery" });
}
