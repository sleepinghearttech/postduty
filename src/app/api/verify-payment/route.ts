import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendAdminWhatsAppAlert, sendCustomerWhatsAppConfirmation } from "@/lib/notifications";
import { sendOrderEmails } from "@/lib/email";

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
  const body = await request.json() as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddress: string;
    totalAmount: number;
    items?: Array<{ productId: string; quantity: number; unitPrice: number }>;
    couponCode?: string;
    discountAmount?: number;
    isGift?: boolean;
    giftMessage?: string;
  };

  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    totalAmount,
  } = body;

  // Step 1 — verify the payment signature is genuine
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const expectedSignature = computeExpectedSignature(razorpayOrderId, razorpayPaymentId, secret);
  const valid = expectedSignature === razorpaySignature;

  if (!valid) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // Resolve items array with backward compatibility for single-product checkout
  let items = body.items;
  if (!items && body.productId && body.quantity && body.unitPrice) {
    items = [{
      productId: body.productId,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
    }];
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  // Step 2 — save order to database
  // Idempotency: webhook may have already created this order if it fired before
  // the frontend reached this point. If so, update details and return success.
  const { data: existingOrder } = await supabaseAdmin
    .from("orders")
    .select("id, customer_name, shipping_address")
    .eq("razorpay_payment_id", razorpayPaymentId)
    .maybeSingle();

  if (existingOrder) {
    const hasPlaceholders = 
      existingOrder.customer_name?.startsWith("[Recovery]") || 
      existingOrder.shipping_address?.startsWith("Address not captured");

    if (hasPlaceholders) {
      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          shipping_address: shippingAddress,
        })
        .eq("id", existingOrder.id);

      if (updateError) {
        console.error("Failed to update recovered order with checkout details:", updateError.message);
      } else {
        // Fetch full updated order and trigger notifications
        const { data: updatedOrder } = await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("id", existingOrder.id)
          .single();

        if (updatedOrder) {
          await Promise.allSettled([
            sendAdminWhatsAppAlert(updatedOrder),
            sendCustomerWhatsAppConfirmation(updatedOrder),
            sendOrderEmails(updatedOrder),
          ]);
        }
      }
    }
    return NextResponse.json({ success: true, orderId: existingOrder.id });
  }

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
      coupon_code: body.couponCode?.trim().toUpperCase() || null,
      discount_amount: body.discountAmount ?? 0,
      is_gift: body.isGift === true,
      gift_message: body.giftMessage || null,
    })
    .select("*")
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
      raw_payload: body,
    });
    return NextResponse.json(
      { error: `Payment received but order could not be saved. Please contact postdutyswag@gmail.com with your payment ID: ${razorpayPaymentId}` },
      { status: 500 }
    );
  }

  // Step 3 — save order line items
  const orderItemsData = items.map(item => ({
    order_id: order.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));

  const { error: itemError } = await supabaseAdmin
    .from("order_items")
    .insert(orderItemsData);

  if (itemError) {
    console.error("Failed to save order items:", itemError.message);
  }

  // Step 4 — decrement stock for each item
  for (const item of items) {
    const { data: current } = await supabaseAdmin
      .from("products")
      .select("stock")
      .eq("id", item.productId)
      .single();

    if (current) {
      await supabaseAdmin
        .from("products")
        .update({ stock: Math.max(0, current.stock - item.quantity) })
        .eq("id", item.productId);
    }
  }

  // Increment coupon usage if one was applied
  if (body.couponCode) {
    const code = body.couponCode.trim().toUpperCase();
    const { error: rpcError } = await supabaseAdmin.rpc("increment_coupon_usage", { coupon_code: code });
    if (rpcError) {
      // Fallback: manual increment if the RPC isn't set up in Supabase
      console.warn("[verify-payment] RPC increment_coupon_usage failed, trying manual:", rpcError.message);
      const { data } = await supabaseAdmin
        .from("coupons")
        .select("times_used")
        .eq("code", code)
        .single();
      if (data) {
        await supabaseAdmin
          .from("coupons")
          .update({ times_used: (data as { times_used: number }).times_used + 1 })
          .eq("code", code);
      }
    }
  }

  // Trigger admin and customer alerts (WhatsApp + Email)
  await Promise.allSettled([
    sendAdminWhatsAppAlert(order),
    sendCustomerWhatsAppConfirmation(order),
    sendOrderEmails(order),
  ]);

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
        notes: {
          productId?: string;
          quantity?: string;
          items?: string;
          couponCode?: string;
          discountAmount?: string;
          isGift?: string;
          giftMessage?: string;
        } | null;
      };
    };
  };
};

async function handleRazorpayWebhook(
  request: NextRequest,
  signature: string
): Promise<NextResponse> {
  const rawBody = await request.text();

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  if (expected !== signature) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as RazorpayWebhookEvent;

  if (event.event !== "payment.captured") {
    return NextResponse.json({ received: true });
  }

  const payment = event.payload.payment.entity;

  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("razorpay_payment_id", payment.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  // Parse items from notes for webhook recovery
  const notes = payment.notes;
  let recoveryItems: Array<{ productId: string; quantity: number }> = [];

  if (notes && notes.items) {
    try {
      recoveryItems = JSON.parse(notes.items);
    } catch (e) {
      console.error("Failed to parse items from webhook notes:", e);
    }
  }

  // Backward compatibility fallback for single-item order notes
  if (recoveryItems.length === 0 && notes?.productId && notes?.quantity) {
    recoveryItems = [{
      productId: notes.productId,
      quantity: parseInt(notes.quantity, 10),
    }];
  }

  if (recoveryItems.length > 0 && recoveryItems.every(i => i.productId && !isNaN(i.quantity))) {
    const productIds = recoveryItems.map(i => i.productId);
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, price")
      .in("id", productIds);

    const { data: recoveredOrder, error: recoveryOrderError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: `[Recovery] See Razorpay payment ${payment.id}`,
        customer_email: payment.email,
        customer_phone: payment.contact,
        shipping_address: `Address not captured — contact customer at ${payment.contact}`,
        total_amount: payment.amount,
        status: "paid",
        razorpay_order_id: payment.order_id,
        razorpay_payment_id: payment.id,
        coupon_code: notes?.couponCode || null,
        discount_amount: notes?.discountAmount ? parseInt(notes.discountAmount, 10) : 0,
        is_gift: notes?.isGift === "true",
        gift_message: notes?.giftMessage || null,
      })
      .select("*")
      .single();

    if (!recoveryOrderError && recoveredOrder) {
      const orderItemsToInsert = recoveryItems.map(item => {
        const prod = products?.find(p => p.id === item.productId);
        const unitPrice = prod ? prod.price : Math.round(payment.amount / recoveryItems.length);
        return {
          order_id: recoveredOrder.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: unitPrice,
        };
      });

      await supabaseAdmin.from("order_items").insert(orderItemsToInsert);

      // Decrement stock in parallel
      for (const item of recoveryItems) {
        const { data: product } = await supabaseAdmin
          .from("products")
          .select("stock")
          .eq("id", item.productId)
          .single();

        if (product) {
          await supabaseAdmin
            .from("products")
            .update({ stock: Math.max(0, product.stock - item.quantity) })
            .eq("id", item.productId);
        }
      }

      console.warn(
        "Webhook recovery: created order from webhook notes. Admin must collect shipping address.",
        recoveredOrder.id
      );

      // Trigger admin and customer alerts (WhatsApp + Email)
      await Promise.allSettled([
        sendAdminWhatsAppAlert(recoveredOrder),
        sendCustomerWhatsAppConfirmation(recoveredOrder),
        sendOrderEmails(recoveredOrder),
      ]);

      return NextResponse.json({ received: true, status: "recovered" });
    }
  }

  // Fallback: notes missing or order insert failed — log for manual recovery.
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
    "Webhook recovery: could not create order — logged to failed_order_logs.",
    payment.id
  );

  return NextResponse.json({ received: true, status: "logged_for_recovery" });
}
