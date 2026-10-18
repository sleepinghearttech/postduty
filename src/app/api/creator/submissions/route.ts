import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { requireCreator, creatorDenied, plainText, safeHttps, creatorAudit } from '@/lib/creator-auth';

export async function POST(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({error: 'Invalid submission.'}, {status: 400});
  const title = plainText(body.title, 150);
  const proposedPrice = Math.round(Number(body?.proposed_price_rupees) * 100);
  const stock = Number(body?.stock ?? 0);
  const days = Number(body?.preparation_days ?? 0);
  if (!title || !Number.isSafeInteger(proposedPrice) || proposedPrice < 100 || proposedPrice > 100000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 100000 || !Number.isInteger(days) || days < 0 || days > 365) return NextResponse.json({ error: 'Enter a name, positive price, valid stock and preparation time.' }, { status: 400 });
  const media = Array.isArray(body.media) ? body.media.filter(item => item && typeof item === 'object').slice(0, 12).map((item: {url?: unknown; type?: unknown; alt?: unknown; attribution?: unknown}) => ({
    url: safeHttps(item.url), type: item.type === 'video' ? 'video' : 'image', alt: plainText(item.alt, 250), attribution: plainText(item.attribution, 500),
  })).filter((item: {url: string | null}) => item.url) : [];
  // Existing canonical products must be edited by the owner. Do not clone their
  // inventory as a side effect of approving a creator's change proposal.
  if (body.product_id) return NextResponse.json({ error: 'For changes to an existing product, contact the owner. This form submits new products only.' }, { status: 400 });
  const storefronts = Array.isArray(body.storefronts) ? body.storefronts.filter((value: unknown) => value === 'general' || value === 'christmas') : ['general'];
  if (!storefronts.length) return NextResponse.json({ error: 'Select at least one storefront.' }, { status: 400 });
  const id = crypto.randomUUID();
  try {
    await creatorAudit(creator.user_id!, 'creator_submission_requested', 'submission', id);
    const { error } = await supabaseAdmin.from(commerceTable('creator_submissions')).insert({
      id, creator_id: creator.id, product_id: null, title, proposed_price: proposedPrice, status: 'submitted',
      details: { description: plainText(body.description, 10000), materials: plainText(body.materials, 1000), category: plainText(body.category, 100), stock, preparation_days: days,
        storefronts, media, made_to_order: body.made_to_order === true, production_notes: plainText(body.production_notes, 2000), license_status: plainText(body.license_status, 100) },
    });
    if (error) throw error;
    return NextResponse.json({ id, submitted: true });
  } catch { return NextResponse.json({ error: 'The submission could not be saved. Your public listing has not changed.' }, { status: 500 }); }
}
