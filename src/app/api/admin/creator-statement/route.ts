import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/commerce-auth';
import { uuid } from '@/lib/creator-auth';
import { loadWeeklyStatement } from '@/lib/creator-statement';

const headers = { 'Cache-Control': 'private, no-store' };
/** Owner-only weekly payout statement for one creator (Monday–Sunday, India time). */
export async function GET(request: NextRequest) {
  if (!(await requireOwner(request))) return NextResponse.json({ error: 'Owner access required.' }, { status: 401, headers });
  const creatorId = request.nextUrl.searchParams.get('creator_id');
  const week = request.nextUrl.searchParams.get('week') ?? '';
  if (!uuid(creatorId) || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return NextResponse.json({ error: 'Choose a creator and a week.' }, { status: 400, headers });
  try {
    return NextResponse.json({ statement: await loadWeeklyStatement(creatorId as string, week) }, { headers });
  } catch {
    return NextResponse.json({ error: 'The statement could not be prepared. Check that the phase B migration is applied.' }, { status: 503, headers });
  }
}
