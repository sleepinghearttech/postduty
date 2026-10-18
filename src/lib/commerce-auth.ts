import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function equalSecret(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifies the supplied token independently of every password/session cookie. */
export async function requireGoogleOwner(token: string | undefined): Promise<boolean> {
  const ownerId = process.env.COMMERCE_OWNER_USER_ID;
  const googleSubject = process.env.COMMERCE_OWNER_GOOGLE_SUB;
  if (!ownerId || !googleSubject || !token || token.length > 8192) return false;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    return !error && !!user && user.id === ownerId && !user.is_anonymous &&
      !!user.identities?.some(identity => identity.provider === 'google' && identity.id === googleSubject);
  } catch { return false; }
}

/** Server-verified identity only. User-editable metadata is never an authorization source. */
export async function requireOwner(request?: NextRequest): Promise<boolean> {
  const jar = request?.cookies ?? await cookies();
  if (equalSecret(jar.get('admin_session')?.value, process.env.ADMIN_SECRET)) return true;
  const auth = request?.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : jar.get('commerce_access_token')?.value;
  return requireGoogleOwner(token);
}

/** Same-origin browser mutations; bearer API clients may omit Origin. */
export function isAllowedMutationOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
  }
  return request.headers.get('sec-fetch-site') !== 'cross-site';
}
