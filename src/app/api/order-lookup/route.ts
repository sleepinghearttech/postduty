import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { OrderWithItems } from "@/lib/types";

function normalizePhone(phone: string): string {
  // Compare last 10 digits so +91/leading-0/spacing differences don't matter
  return phone.replace(/\D/g, "").slice(-10);
}

const GENERIC_ERROR = { error: "No order found with that order ID and phone number." };

export async function POST(request: Request) {
  const { orderId, phone } = (await request.json()) as {
    orderId?: string;
    phone?: string;
  };

  if (!orderId || !phone) {
    return NextResponse.json({ error: "Order ID and phone number are required." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      `
      id,
      status,
      tracking_number,
      total_amount,
      customer_phone,
      created_at,
      order_items (
        id,
        quantity,
        unit_price,
        products ( name )
      )
    `
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return NextResponse.json(GENERIC_ERROR, { status: 404 });
  }

  const typedOrder = order as unknown as OrderWithItems;

  if (normalizePhone(typedOrder.customer_phone) !== normalizePhone(phone)) {
    return NextResponse.json(GENERIC_ERROR, { status: 404 });
  }

  return NextResponse.json({
    status: typedOrder.status,
    trackingNumber: typedOrder.tracking_number,
    totalAmount: typedOrder.total_amount,
    createdAt: typedOrder.created_at,
    items: typedOrder.order_items.map((item) => ({
      name: item.products?.name ?? "Product",
      quantity: item.quantity,
      unitPrice: item.unit_price,
    })),
  });
}
