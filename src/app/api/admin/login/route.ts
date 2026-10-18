import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAllowedMutationOrigin } from '@/lib/commerce-auth';

const noStore = { 'Cache-Control': 'private, no-store' };
export async function POST(request: NextRequest) {
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: noStore });
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return NextResponse.json({ error: 'Invalid login request' }, { status: 413, headers: noStore });
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return NextResponse.json({ error: 'Use a JSON login request' }, { status: 415, headers: noStore });
  let password: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: 'Invalid login request' }, { status: 413, headers: noStore });
    const body: unknown = JSON.parse(raw);
    password = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string,unknown>).password : undefined;
  } catch { return NextResponse.json({ error: 'Invalid login request' }, { status: 400, headers: noStore }); }
  if (typeof password !== 'string' || !password || password.length > 1024) return NextResponse.json({ error: 'Invalid login request' }, { status: 400, headers: noStore });
  const secret = process.env.ADMIN_SECRET;
  const actual = Buffer.from(password); const expected = Buffer.from(secret ?? '');
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual,expected)) return NextResponse.json({ error: 'Invalid password' }, { status: 401, headers: noStore });
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set('admin_session',secret,{
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, path: '/',
  });
  return response;
}
