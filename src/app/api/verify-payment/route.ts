import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

function computeExpectedSignature(orderId: string, paymentId: string, secret: string): string {
  return createHmac("sha256", secret.trim())
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "Failed to save order", step: "db_insert", detail: orderError?.message }, { status: 500 });
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
