import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { orderId, verification } = await request.json() as {
      orderId: string;
      verification: string;
    };

    if (!orderId || !verification) {
      return NextResponse.json({ error: "Order ID and verification are required" }, { status: 400 });
    }

    const cleanVerification = verification.trim().toLowerCase();
    const cleanPhone = verification.replace(/\D/g, "");

    // 1. Fetch order details using service client to bypass RLS
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Validate email or phone verification matches order data
    const emailMatch = order.customer_email.trim().toLowerCase() === cleanVerification;
    
    // Normalize DB customer phone number to digits for comparison
    const dbPhoneDigits = order.customer_phone.replace(/\D/g, "");
    
    // Support partial match (e.g. matching last 10 digits to handle country code variation)
    const phoneMatch = dbPhoneDigits.endsWith(cleanPhone) && cleanPhone.length >= 10;

    if (!emailMatch && !phoneMatch) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 3. Fetch order items with product details
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select(`
        id,
        order_id,
        product_id,
        quantity,
        unit_price,
        created_at,
        products (
          name,
          image_url
        )
      `)
      .eq("order_id", orderId);

    if (itemsError) {
      console.error("Failed to fetch order items during lookup:", itemsError.message);
    }

    return NextResponse.json({
      order,
      order_items: items || [],
    });
  } catch (err) {
    console.error("Error in order lookup API:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
