import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import { creatorFulfillment } from '@/lib/creator-data';
import { requireCreator, verifiedCreatorIdentity, creatorDenied } from '@/lib/creator-auth';

export async function GET(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  const [submissions, fulfillment, settlements] = await Promise.all([
    supabaseAdmin.from(commerceTable('creator_submissions')).select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(100),
    creatorFulfillment(creator.id).then(data => ({data, error: null})).catch(() => ({data: null, error: true})),
    supabaseAdmin.from(commerceTable('settlements')).select('id,creator_id,amount_paise,status,note,period_start,period_end,created_at').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if ([submissions, fulfillment, settlements].some(result => result.error)) return NextResponse.json({ error: 'Creator records are not available yet. Please contact the owner.' }, { status: 503 });
  return NextResponse.json({ creator, submissions: submissions.data, fulfillment: fulfillment.data, settlements: settlements.data, sandbox: isCommerceSandbox() }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const identity = await verifiedCreatorIdentity(request);
  if (!identity) return creatorDenied();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.token !== 'string' || !/^[0-9a-f]{64}$/.test(body.token)) return NextResponse.json({ error: 'This invitation is invalid.' }, { status: 400 });
  const bytes = new TextEncoder().encode(body.token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const tokenHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const { data, error } = await supabaseAdmin.rpc(`${isCommerceSandbox() ? 'preview_' : ''}redeem_creator_invitation`, {
    p_token_hash: tokenHash, p_user_id: identity.userId, p_email: identity.email,
  });
  if (error || !data) return NextResponse.json({ error: 'This invitation has expired, was already used, or belongs to a different Google email.' }, { status: 403 });
  return NextResponse.json({ accepted: true });
}
