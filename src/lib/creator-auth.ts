import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import type { Creator } from '@/lib/creator-types';

export async function verifiedCreatorIdentity(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token.length > 12000) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email || !user.email_confirmed_at) return null;
  const providers = user.app_metadata?.providers;
  if (user.app_metadata?.provider !== 'google' && !(Array.isArray(providers) && providers.includes('google'))) return null;
  return { userId: user.id, email: user.email.toLowerCase().trim() };
}

export async function requireCreator(request: NextRequest): Promise<Creator | null> {
  const identity = await verifiedCreatorIdentity(request);
  if (!identity) return null;
  const { data, error } = await supabaseAdmin.from(commerceTable('creators'))
    .select('*').eq('user_id', identity.userId).eq('email', identity.email).eq('status', 'active').maybeSingle();
  if (error || !data) return null;
  const { data: membership } = await supabaseAdmin.from(commerceTable('commerce_memberships'))
    .select('user_id').eq('user_id', identity.userId).eq('role', 'creator').eq('creator_id', data.id).eq('status', 'active').maybeSingle();
  return membership ? data as Creator : null;
}

export function creatorDenied() {
  return NextResponse.json({ error: 'This Google account is not an active PostDuty creator yet. If you were invited, open the invitation link the owner sent you (it starts with store.postduty.in/creator#invite=) and sign in with the invited Google email.' }, { status: 403 });
}

export async function creatorAudit(actorId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin.from(commerceTable('audit_events')).insert({
    actor: actorId, action, entity_type: entityType, entity_id: entityId, details,
  });
  if (error) throw new Error('Could not record the audit entry.');
}

export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const plainText = (value: unknown, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function safeHttps(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
