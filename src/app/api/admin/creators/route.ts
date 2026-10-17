import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import { creatorFulfillment } from '@/lib/creator-data';
import { creatorAudit, plainText, uuid } from '@/lib/creator-auth';

const unavailable = () => NextResponse.json({ error: 'Creator management is not available yet. Check the commerce migration and authentication configuration.' }, { status: 503 });
export async function GET(request: NextRequest) {
  if (!(await requireOwner(request))) return NextResponse.json({ error: 'Owner access required.' }, { status: 401 });
  const [creators, submissions, fulfillment, settlements, paidOrders] = await Promise.all([
    supabaseAdmin.from(commerceTable('creators')).select('*').order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from(commerceTable('creator_submissions')).select('*').order('created_at', { ascending: false }).limit(200),
    creatorFulfillment().then(data => ({data, error: null})).catch(() => ({data: null, error: true})),
    supabaseAdmin.from(commerceTable('settlements')).select('*').order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from(commerceTable('orders')).select('id').in('status', ['paid', 'shipped', 'delivered']).not('razorpay_payment_id', 'is', null).order('created_at', { ascending: false }).limit(200),
  ]);
  if ([creators, submissions, fulfillment, settlements, paidOrders].some(result => result.error)) return unavailable();
  const orders = paidOrders.data?.map(row => row.id) ?? [];
  const items = orders.length ? await supabaseAdmin.from(commerceTable('order_items')).select('id,order_id,product_id,creator_id,quantity').in('order_id', orders).limit(500) : { data: [], error: null };
  if (items.error) return unavailable();
  return NextResponse.json({ creators: creators.data, submissions: submissions.data, fulfillment: fulfillment.data, settlements: settlements.data, assignable_items: items.data, sandbox: isCommerceSandbox() }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (!(await requireOwner(request))) return NextResponse.json({ error: 'Owner access required.' }, { status: 401 });
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 100000) return NextResponse.json({error: 'Request too large.'}, {status: 413});
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'Choose an action.' }, { status: 400 });
  try {
    if (body.action === 'invite') {
      const email = plainText(body.email, 254).toLowerCase();
      const displayName = plainText(body.display_name, 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName) return NextResponse.json({ error: 'Enter a valid email and creator display name.' }, { status: 400 });
      const { data: existing } = await supabaseAdmin.from(commerceTable('creators')).select('id,status').eq('email', email).maybeSingle();
      if (existing && existing.status !== 'invited') return NextResponse.json({ error: 'This email already has a creator account. Manage its access below.' }, { status: 409 });
      const creatorId = existing?.id ?? crypto.randomUUID();
      await creatorAudit('owner', 'creator_invite_requested', 'creator', creatorId);
      if (!existing) {
        const { error } = await supabaseAdmin.from(commerceTable('creators')).insert({ id: creatorId, email, display_name: displayName, bio: '', status: 'invited', commission_bps: 0 });
        if (error) throw error;
      }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      // An unaccepted invitation can be replaced; the old link immediately stops working.
      const { error: invalidateError } = await supabaseAdmin.from(commerceTable('creator_invites')).update({ expires_at: new Date().toISOString() }).eq('creator_id', creatorId).is('accepted_at', null);
      if (invalidateError) throw invalidateError;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin.from(commerceTable('creator_invites')).insert({ creator_id: creatorId, email, token_hash: tokenHash, expires_at: expiresAt });
      if (error) throw error;
      // Fragment avoids sending the invitation secret in HTTP logs or referrer headers.
      return NextResponse.json({ invitation_url: `${request.nextUrl.origin}/creator#invite=${token}`, expires_at: expiresAt, message: 'Invitation link created. No email or message has been sent.' });
    }
    if (body.action === 'creator_access') {
      if (!uuid(body.creator_id) || (typeof body.status !== 'string' || !['active', 'suspended'].includes(body.status))) return NextResponse.json({ error: 'Invalid access change.' }, { status: 400 });
      const { data: creator } = await supabaseAdmin.from(commerceTable('creators')).select('id,user_id,status').eq('id', body.creator_id).maybeSingle();
      if (!creator?.user_id || creator.status === 'invited') return NextResponse.json({ error: 'The creator must first redeem their invitation.' }, { status: 400 });
      await creatorAudit('owner', `creator_${body.status}_requested`, 'creator', creator.id);
      const { error } = await supabaseAdmin.from(commerceTable('creators')).update({ status: body.status }).eq('id', creator.id);
      if (error) throw error;
      return NextResponse.json({ saved: true });
    }
    if (body.action === 'commission') {
      const basisPoints = Math.round(Number(body.commission_percent) * 100);
      if (!uuid(body.creator_id) || !Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) return NextResponse.json({ error: 'Commission must be between 0% and 100%.' }, { status: 400 });
      await creatorAudit('owner', 'commission_change_requested', 'creator', body.creator_id, { commission_bps: basisPoints });
      const { error } = await supabaseAdmin.from(commerceTable('creators')).update({ commission_bps: basisPoints }).eq('id', body.creator_id);
      if (error) throw error;
      return NextResponse.json({ saved: true });
    }
    if (body.action === 'review_submission') {
      if (!uuid(body.id) || (typeof body.status !== 'string' || !['approved', 'rejected'].includes(body.status))) return NextResponse.json({ error: 'Invalid review.' }, { status: 400 });
      const { data: submission } = await supabaseAdmin.from(commerceTable('creator_submissions')).select('*').eq('id', body.id).maybeSingle();
      if (!submission || submission.status !== 'submitted') return NextResponse.json({ error: 'This submission was already reviewed. Refresh the list.' }, { status: 409 });
      const price = Math.round(Number(body.price_rupees) * 100);
      if (body.status === 'approved' && (!Number.isSafeInteger(price) || price < 100 || price > 100000000)) return NextResponse.json({ error: 'Enter an owner-approved positive selling price.' }, { status: 400 });
      const { data: review, error } = await supabaseAdmin.rpc(`${isCommerceSandbox() ? 'preview_' : ''}review_creator_submission`, {
        p_submission_id: submission.id, p_status: body.status, p_price_paise: body.status === 'approved' ? price : null, p_note: plainText(body.owner_note, 2000),
      });
      if (error) throw error;
      return NextResponse.json({ saved: true, product_id: review?.product_id, message: body.status === 'approved' ? 'Unpublished draft created. Review its license, price and details in Products before publishing.' : 'Submission rejected with your feedback.' });
    }
    if (body.action === 'assign') {
      if (!uuid(body.order_item_id) || !uuid(body.creator_id)) return NextResponse.json({ error: 'Choose a paid order item and an active creator.' }, { status: 400 });
      const { data: creator } = await supabaseAdmin.from(commerceTable('creators')).select('id').eq('id', body.creator_id).eq('status', 'active').maybeSingle();
      const { data: item } = await supabaseAdmin.from(commerceTable('order_items')).select('*').eq('id', body.order_item_id).maybeSingle();
      if (!creator || !item) return NextResponse.json({ error: 'Creator or order item unavailable.' }, { status: 400 });
      const { data: order } = await supabaseAdmin.from(commerceTable('orders')).select('id,customer_name,customer_phone,shipping_address,status,razorpay_payment_id').eq('id', item.order_id).maybeSingle();
      if (!order?.razorpay_payment_id || !['paid', 'shipped', 'delivered'].includes(order.status)) return NextResponse.json({ error: 'Only verified paid order items can be assigned.' }, { status: 400 });
      if (item.fulfillment_status === 'dispatched') return NextResponse.json({ error: 'Dispatched items cannot be reassigned.' }, { status: 409 });
      if (item.creator_id === creator.id) return NextResponse.json({ saved: true });
      await creatorAudit('owner', 'fulfillment_assignment_requested', 'order_item', item.id, { creator_id: creator.id, previous_creator_id: item.creator_id || null });
      let assignmentQuery = supabaseAdmin.from(commerceTable('order_items')).update({
        creator_id: creator.id, fulfillment_status: 'awaiting_acceptance', tracking_number: null, tracking_url: null, earnings_review_required: true,
      }).eq('id', item.id).eq('fulfillment_status', item.fulfillment_status);
      assignmentQuery = item.creator_id ? assignmentQuery.eq('creator_id', item.creator_id) : assignmentQuery.is('creator_id', null);
      const { data: changed, error } = await assignmentQuery.select('id').maybeSingle();
      if (error) throw error;
      if (!changed) return NextResponse.json({ error: 'This item changed. Refresh before reassigning.' }, { status: 409 });
      return NextResponse.json({ saved: true });
    }
    if (body.action === 'settlement_create') {
      const amount = Math.round(Number(body.amount_rupees) * 100);
      if (!uuid(body.creator_id) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) return NextResponse.json({ error: 'Select a creator and enter a positive settlement amount.' }, { status: 400 });
      const note = plainText(body.note, 1000);
      if (!note) return NextResponse.json({ error: 'Describe the orders, costs and period included in this reconciliation.' }, { status: 400 });
      const id = crypto.randomUUID();
      await creatorAudit('owner', 'settlement_record_requested', 'settlement', id, { creator_id: body.creator_id, amount_paise: amount });
      const { error } = await supabaseAdmin.from(commerceTable('settlements')).insert({ id, creator_id: body.creator_id, amount_paise: amount, note, status: 'pending' });
      if (error) throw error;
      return NextResponse.json({ saved: true, message: 'Reconciliation record created. No money has moved.' });
    }
    if (body.action === 'settlement_approve') {
      if (!uuid(body.id)) return NextResponse.json({ error: 'Invalid settlement.' }, { status: 400 });
      await creatorAudit('owner', 'settlement_approval_requested', 'settlement', body.id);
      const { data, error } = await supabaseAdmin.from(commerceTable('settlements')).update({ status: 'approved' }).eq('id', body.id).eq('status', 'pending').select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Settlement is unavailable or already approved.' }, { status: 409 });
      return NextResponse.json({ saved: true, message: 'Settlement approved for manual handling. No transfer has been initiated.' });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch { return NextResponse.json({ error: 'The change could not be completed. Refresh the records before retrying.' }, { status: 500 }); }
}
