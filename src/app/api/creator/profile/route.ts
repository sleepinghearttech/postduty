import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { requireCreator, creatorDenied, plainText, creatorAudit } from '@/lib/creator-auth';

export async function POST(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = plainText(body?.display_name, 100);
  const capacity = Number(body?.capacity ?? 0);
  if (!displayName || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 100000) return NextResponse.json({ error: 'Enter your display name and a valid weekly production capacity.' }, { status: 400 });
  try {
    await creatorAudit(creator.user_id!, 'creator_profile_update_requested', 'creator', creator.id);
    const { error } = await supabaseAdmin.from(commerceTable('creators')).update({ display_name: displayName, bio: plainText(body?.bio, 1200), capacity }).eq('id', creator.id).eq('user_id', creator.user_id);
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch { return NextResponse.json({ error: 'Profile could not be saved. Please try again.' }, { status: 500 }); }
}
