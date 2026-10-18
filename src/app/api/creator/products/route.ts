import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import { requireCreator, creatorDenied, creatorAudit } from '@/lib/creator-auth';
import { CreatorProductInputError, creatorMediaPrefix, validateCreatorProductInput } from '@/lib/creator-product-input';

const headers = { 'Cache-Control': 'private, no-store' };
// Only what a creator needs to manage their own listing; no private operations, costs or other creators' data.
const COLUMNS = 'id,name,slug,description,price,stock,is_active,image_url,commerce,updated_at';

/** The signed-in creator's own products and their pending revisions. */
export async function GET(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  const [products, revisions] = await Promise.all([
    supabaseAdmin.from(commerceTable('products')).select(COLUMNS).eq('creator_id', creator.id).order('updated_at', { ascending: false }).limit(200),
    supabaseAdmin.from(commerceTable('creator_submissions')).select('id,product_id,title,proposed_price,details,status,owner_note,updated_at').eq('creator_id', creator.id).eq('kind', 'revision').order('updated_at', { ascending: false }).limit(200),
  ]);
  if (products.error || revisions.error) return NextResponse.json({ error: 'Your products are not available yet. Please contact the owner.' }, { status: 503, headers });
  return NextResponse.json({ products: products.data, revisions: revisions.data }, { headers });
}

/**
 * Create a draft, edit an own draft directly, or queue a revision of an own live product for owner approval.
 * Ownership, field whitelisting and the live/draft decision are enforced inside one database function.
 */
export async function POST(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  if (Number(request.headers.get('content-length') ?? 0) > 100_000) return NextResponse.json({ error: 'The product details are too large.' }, { status: 413, headers });
  const body = await request.json().catch(() => null);
  let input;
  try { input = validateCreatorProductInput(body, creatorMediaPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL, isCommerceSandbox())); }
  catch (error) { if (error instanceof CreatorProductInputError) return NextResponse.json({ error: error.message }, { status: 400, headers }); throw error; }
  try {
    await creatorAudit(creator.user_id!, input.product_id ? 'creator_product_edit_requested' : 'creator_product_draft_requested', 'product', input.product_id ?? 'new', { fields: Object.keys(input.fields), proposed_price_paise: input.proposed_price_paise });
    const { data, error } = await supabaseAdmin.rpc(commerceTable('creator_save_product'), { p_creator_id: creator.id, p_product_id: input.product_id, p_fields: input.fields, p_proposed_price: input.proposed_price_paise });
    if (error?.message?.includes('not_your_product')) return NextResponse.json({ error: 'Product not found.' }, { status: 404, headers });
    if (error?.message?.includes('product_archived')) return NextResponse.json({ error: 'This product is archived. Contact the owner to restore it.' }, { status: 409, headers });
    if (error?.message?.includes('changed since')) return NextResponse.json({ error: 'This product changed. Refresh and try again.' }, { status: 409, headers });
    if (error || !data) throw error ?? new Error('save failed');
    const mode = (data as { mode: string }).mode;
    const message = mode === 'revision_pending' ? 'Sent to the owner for approval. Your live listing stays unchanged until then.' : mode === 'draft_created' ? 'Draft created. The owner sets the price and publishes it.' : 'Draft saved. It is not public.';
    return NextResponse.json({ saved: true, ...(data as object), message }, { headers });
  } catch {
    return NextResponse.json({ error: 'The product could not be saved. Your live listing has not changed.' }, { status: 500, headers });
  }
}
