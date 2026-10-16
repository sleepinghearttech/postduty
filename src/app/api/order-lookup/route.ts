import { commerceTable } from '@/lib/commerce-db';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { customerOrderTracking, normalizeTrackingPhone, type TrackingItemRecord, type TrackingOrderRecord } from '@/lib/order-tracking';
import { validOrderReference } from '@/components/commerce/order-outcome';

const GENERIC_ERROR = { error: 'No order found with that order ID and phone number.' };
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 4096) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413, headers });
  }
  const raw = await request.text().catch(() => '');
  if (raw.length > 4096) return NextResponse.json({ error: 'Request is too large.' }, { status: 413, headers });
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* Invalid JSON receives the same input-validation response. */ }
  const phone = normalizeTrackingPhone(body?.phone);
  if (!validOrderReference(body?.orderId) || !phone) {
    return NextResponse.json({ error: 'A valid order ID and checkout phone number are required.' }, { status: 400, headers });
  }
  let orderResult: { data: TrackingOrderRecord | null; error: { code?: string } | null } = await supabaseAdmin.from(commerceTable('orders'))
    .select('id,status,tracking_number,total_amount,customer_phone,created_at,is_test')
    .eq('id', body.orderId).maybeSingle();
  if (orderResult.error?.code === '42703') {
    // Pre-commerce schema: preserve the historical phone-gated order view.
    const legacy = await supabaseAdmin.from(commerceTable('orders'))
      .select('id,status,tracking_number,total_amount,customer_phone,created_at')
      .eq('id', body.orderId).maybeSingle();
    orderResult = legacy;
  }
  const { data: order, error } = orderResult;
  if (error || !order || normalizeTrackingPhone(order.customer_phone) !== phone) {
    return NextResponse.json(GENERIC_ERROR, { status: 404, headers });
  }

  // Read fulfillment only after the checkout phone has matched. Shipment data
  // comes from the same canonical order_items that creators update at dispatch.
  let itemResult = await supabaseAdmin.from(commerceTable('order_items'))
    .select(`id,quantity,unit_price,product_name,creator_id,fulfillment_status,tracking_number,courier,tracking_url,products:${commerceTable('products')}(name)`)
    .eq('order_id', order.id).order('created_at', { ascending: true });
  if (itemResult.error?.code === '42703') {
    const legacy = await supabaseAdmin.from(commerceTable('order_items'))
      .select(`id,quantity,unit_price,products:${commerceTable('products')}(name)`)
      .eq('order_id', order.id).order('created_at', { ascending: true });
    itemResult = legacy as typeof itemResult;
  }
  const { data: items, error: itemError } = itemResult;
  if (itemError) {
    return NextResponse.json({ error: 'Shipment updates are temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
  const typedItems = (items ?? []) as unknown as TrackingItemRecord[];
  const creatorIds = [...new Set(typedItems.map(item => item.creator_id).filter((id): id is string => !!id))];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length) {
    // Display name is the only creator profile field needed by the customer.
    const { data: creators } = await supabaseAdmin.from(commerceTable('creators'))
      .select('id,display_name').in('id', creatorIds);
    for (const creator of creators ?? []) creatorNames.set(creator.id, creator.display_name);
  }
  return NextResponse.json(customerOrderTracking(order as TrackingOrderRecord, typedItems, creatorNames), { headers });
}
