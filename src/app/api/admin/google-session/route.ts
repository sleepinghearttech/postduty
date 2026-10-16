import { NextRequest, NextResponse } from 'next/server';
import { requireGoogleOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
const noStore = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  return NextResponse.json({ enabled: !!(process.env.COMMERCE_OWNER_USER_ID && process.env.COMMERCE_OWNER_GOOGLE_SUB) }, { headers: noStore });
}
export async function POST(request: NextRequest) {
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: noStore });
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  // Existing admin cookies must never authorize an arbitrary replacement Google session.
  if (!await requireGoogleOwner(token)) return NextResponse.json({ error: 'This Google identity has not been authorized as the owner.' }, { status: 403, headers: noStore });
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set('commerce_access_token',token!,{
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3000,
  });
  return response;
}
