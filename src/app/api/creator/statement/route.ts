import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { requireCreator, creatorDenied } from '@/lib/creator-auth';
import { loadWeeklyStatement } from '@/lib/creator-statement';

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Read-only: the signed-in creator's own weekly statement and settlement status. Statement lines carry
 * order references, item names and amounts only; no customer contact details.
 */
export async function GET(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  const week = request.nextUrl.searchParams.get('week') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return NextResponse.json({ error: 'Choose a week.' }, { status: 400, headers });
  try {
    const [statement, settlements] = await Promise.all([
      loadWeeklyStatement(creator.id, week),
      supabaseAdmin.from(commerceTable('settlements')).select('id,amount_paise,status,period_start,period_end,created_at,approved_at,paid_on,payment_reference,lines').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(100),
    ]);
    if (settlements.error) throw settlements.error;
    return NextResponse.json({ statement, settlements: settlements.data }, { headers });
  } catch {
    return NextResponse.json({ error: 'Your statement is not available right now. Please try again later.' }, { status: 503, headers });
  }
}
