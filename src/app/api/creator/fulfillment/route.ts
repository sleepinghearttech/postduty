import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { requireCreator, creatorDenied, plainText, uuid, safeHttps, creatorAudit } from '@/lib/creator-auth';
import { fulfillmentNext, type FulfillmentStatus } from '@/lib/creator-types';

export async function POST(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!uuid(body?.id)) return NextResponse.json({ error: 'Invalid assignment.' }, { status: 400 });
  const { data: assignment } = await supabaseAdmin.from(commerceTable('order_items')).select('id,fulfillment_status,order_id').eq('id', body.id).eq('creator_id', creator.id).maybeSingle();
  if (!assignment) return creatorDenied();
  const currentStatus = assignment.fulfillment_status === 'awaiting_acceptance' ? 'assigned' : assignment.fulfillment_status;
  const next = fulfillmentNext[currentStatus as FulfillmentStatus];
  const { data: paidOrder } = await supabaseAdmin.from(commerceTable('orders')).select('id').eq('id', assignment.order_id).in('status', ['paid', 'shipped', 'delivered']).not('razorpay_payment_id', 'is', null).maybeSingle();
  if (!paidOrder) return creatorDenied();
  if (!next || next !== body.status) return NextResponse.json({ error: 'This fulfillment status has changed. Refresh and try the next available action.' }, { status: 409 });
  const tracking = plainText(body.tracking_code, 100);
  const trackingUrl = safeHttps(body.tracking_url);
  if (next === 'dispatched' && (!tracking || (body.tracking_url && !trackingUrl))) return NextResponse.json({ error: 'Add a tracking number and a valid HTTPS courier link, if supplied.' }, { status: 400 });
  try {
    await creatorAudit(creator.user_id!, `fulfillment_${next}_requested`, 'fulfillment', assignment.id, { previous_status: assignment.fulfillment_status });
    const { data, error } = await supabaseAdmin.from(commerceTable('order_items')).update({ fulfillment_status: next, tracking_number: next === 'dispatched' ? tracking : null, tracking_url: next === 'dispatched' ? trackingUrl : null }).eq('id', assignment.id).eq('creator_id', creator.id).eq('fulfillment_status', assignment.fulfillment_status).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'The assignment changed; refresh before continuing.' }, { status: 409 });
    return NextResponse.json({ saved: true });
  } catch { return NextResponse.json({ error: 'Could not save this update. Please refresh before retrying.' }, { status: 500 }); }
}
