import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import { creatorFulfillment } from '@/lib/creator-data';
import { creatorAudit, plainText, uuid } from '@/lib/creator-auth';
import { CreatorProfileError, validateCreatorProfile, validatePickupAddress } from '@/lib/creator-profile';
import { parseSettlementPayment, payoutConfig } from '@/lib/creator-payouts';
import { loadWeeklyStatement } from '@/lib/creator-statement';

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
  // Private pickup addresses (owner only). Absent before the phase B migration.
  const pickups = await supabaseAdmin.from(commerceTable('creator_pickup_addresses')).select('*');
  return NextResponse.json({ creators: creators.data, submissions: submissions.data, fulfillment: fulfillment.data, settlements: settlements.data, assignable_items: items.data, pickups: pickups.error ? [] : pickups.data, sandbox: isCommerceSandbox() }, { headers: { 'Cache-Control': 'private, no-store' } });
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
      // A settled line is frozen to the creator it was paid to.
      if (item.settlement_id) return NextResponse.json({ error: 'This item is already in a creator settlement and cannot be reassigned.' }, { status: 409 });
      if (item.creator_id === creator.id) return NextResponse.json({ saved: true });
      await creatorAudit('owner', 'fulfillment_assignment_requested', 'order_item', item.id, { creator_id: creator.id, previous_creator_id: item.creator_id || null });
      let assignmentQuery = supabaseAdmin.from(commerceTable('order_items')).update({
        creator_id: creator.id, fulfillment_status: 'awaiting_acceptance', tracking_number: null, tracking_url: null, earnings_review_required: true,
      }).eq('id', item.id).eq('fulfillment_status', item.fulfillment_status).is('settlement_id', null);
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
      // Status check, approval timestamp and audit event commit together.
      let { data, error } = await supabaseAdmin.rpc(commerceTable('approve_settlement'), { p_settlement_id: body.id });
      // Before the phase B migration the function does not exist: keep the original conditional update.
      if (error && ['42883', 'PGRST202'].includes(String((error as { code?: string }).code))) {
        ({ data, error } = await supabaseAdmin.from(commerceTable('settlements')).update({ status: 'approved' }).eq('id', body.id).eq('status', 'pending').select('id').maybeSingle());
      }
      if (error?.message?.includes('invalid_settlement_transition') || (!error && !data)) return NextResponse.json({ error: 'Settlement is unavailable or already approved.' }, { status: 409 });
      if (error) throw error;
      return NextResponse.json({ saved: true, message: 'Settlement approved for manual handling. No transfer has been initiated.' });
    }
    if (body.action === 'settlement_from_statement') {
      if (!uuid(body.creator_id) || typeof body.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.week)) return NextResponse.json({ error: 'Choose a creator and a week.' }, { status: 400 });
      // Recomputed on the server; client-side amounts are never trusted.
      const statement = await loadWeeklyStatement(body.creator_id, body.week);
      const ready = statement.lines.filter(line => line.status === 'ready' && line.payout_paise !== null);
      if (!ready.length) return NextResponse.json({ error: statement.pending_courier_lines ? "Enter the actual courier cost for this week's orders before settling." : 'Nothing is payable for this week.' }, { status: 400 });
      const note = plainText(body.note, 1000) || `Weekly statement ${statement.period_start} to ${statement.period_end}`;
      const lines = ready.map(line => ({ order_item_id: line.order_item_id, order_id: line.order_id, product_name: line.product_name, quantity: line.quantity, line_value: line.line_value, shipping_share: line.shipping_share, gst: line.gst, payment_fee: line.payment_fee, courier_cost: line.courier_cost, platform_fee: line.platform_fee, payout_paise: line.payout_paise }));
      // The database recomputes every line with the same fee configuration and rejects any mismatch.
      const fees = payoutConfig(process.env);
      const { data, error } = await supabaseAdmin.rpc(commerceTable('create_creator_settlement'), { p_creator_id: body.creator_id, p_period_start: statement.period_start, p_period_end: statement.period_end, p_lines: lines, p_note: note, p_payment_fee_bps: fees.paymentFeeBps, p_platform_fee_bps: fees.platformFeeBps });
      if (error?.message?.includes('already_settled')) return NextResponse.json({ error: 'Some lines were settled in the meantime. Refresh the statement.' }, { status: 409 });
      if (error?.message?.includes('payout_mismatch') || error?.message?.includes('order_not_settleable')) return NextResponse.json({ error: 'An order in this statement changed (status, courier cost or fees). Refresh the statement before settling.' }, { status: 409 });
      if (error) throw error;
      return NextResponse.json({ saved: true, settlement: data, message: 'Pending settlement created from the statement. No money has moved.' });
    }
    if (body.action === 'settlement_paid') {
      if (!uuid(body.id)) return NextResponse.json({ error: 'Invalid settlement.' }, { status: 400 });
      let payment: { paid_on: string; reference: string };
      try { payment = parseSettlementPayment(body); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
      const { data, error } = await supabaseAdmin.rpc(commerceTable('mark_settlement_paid'), { p_settlement_id: body.id, p_paid_on: payment.paid_on, p_reference: payment.reference });
      if (error?.message?.includes('invalid_settlement_transition')) return NextResponse.json({ error: 'Only an approved settlement can be marked paid.' }, { status: 409 });
      if (error) throw error;
      return NextResponse.json({ saved: true, settlement: data, message: 'Recorded as paid. This records your transfer; it does not send money.' });
    }
    if (body.action === 'creator_profile') {
      if (!uuid(body.creator_id)) return NextResponse.json({ error: 'Invalid creator.' }, { status: 400 });
      let profile;
      try { profile = validateCreatorProfile(body); } catch (error) { if (error instanceof CreatorProfileError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
      await creatorAudit('owner', 'creator_profile_update_requested', 'creator', body.creator_id, { profile_published: profile.profile_published });
      const { data, error } = await supabaseAdmin.from(commerceTable('creators')).update(profile).eq('id', body.creator_id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Creator not found.' }, { status: 404 });
      return NextResponse.json({ saved: true, message: profile.profile_published ? "Profile saved and shown on this creator's product pages." : 'Profile saved. It is not shown publicly.' });
    }
    if (body.action === 'pickup_address') {
      if (!uuid(body.creator_id)) return NextResponse.json({ error: 'Invalid creator.' }, { status: 400 });
      let pickup;
      try { pickup = validatePickupAddress(body); } catch (error) { if (error instanceof CreatorProfileError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
      await creatorAudit('owner', 'pickup_address_update_requested', 'creator', body.creator_id);
      const { error } = await supabaseAdmin.from(commerceTable('creator_pickup_addresses')).upsert({ creator_id: body.creator_id, ...pickup, updated_at: new Date().toISOString() }, { onConflict: 'creator_id' });
      if (error) throw error;
      return NextResponse.json({ saved: true, message: 'Pickup address saved. It is private to you and appears on packing slips.' });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch { return NextResponse.json({ error: 'The change could not be completed. Refresh the records before retrying.' }, { status: 500 }); }
}
