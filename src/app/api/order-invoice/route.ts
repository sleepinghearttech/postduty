import { NextResponse } from 'next/server';
import { loadInvoice } from '@/lib/invoice-data';
import { normalizeTrackingPhone } from '@/lib/order-tracking';
import { validOrderReference } from '@/components/commerce/order-outcome';

const headers = { 'Cache-Control': 'private, no-store' };
const NOT_FOUND = { error: 'No invoice found with that order ID and phone number.' };

/** Customer invoice: the same order ID + checkout phone verification as the order-status lookup. */
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return NextResponse.json({ error: 'Request is too large.' }, { status: 413, headers });
  const raw = await request.text().catch(() => '');
  if (raw.length > 4096) return NextResponse.json({ error: 'Request is too large.' }, { status: 413, headers });
  let body: Record<string, unknown> | null = null;
  try { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>; } catch { /* same validation response */ }
  const phone = normalizeTrackingPhone(body?.phone);
  if (!validOrderReference(body?.orderId) || !phone) return NextResponse.json({ error: 'A valid order ID and checkout phone number are required.' }, { status: 400, headers });
  try {
    const loaded = await loadInvoice(body.orderId as string);
    // Identical response for unknown orders, wrong phones and unnumbered orders: nothing leaks before verification.
    if (!loaded || normalizeTrackingPhone(loaded.customerPhone) !== phone || !loaded.invoice) return NextResponse.json(NOT_FOUND, { status: 404, headers });
    return NextResponse.json({ invoice: loaded.invoice }, { headers });
  } catch {
    return NextResponse.json({ error: 'Invoices are temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
