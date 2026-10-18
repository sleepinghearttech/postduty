/**
 * Creator self-service product input (pure). Only creator-editable fields survive; owner-only fields
 * (price approval, publishing, storefronts, catalog_only, fees, GST/HSN, variants, stock, combos) are
 * never read. The database function applies the same whitelist again.
 */
export class CreatorProductInputError extends Error {}
const bad = (message: string): never => { throw new CreatorProductInputError(message); };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CREATOR_EDITABLE_FIELDS = ['name', 'description', 'short_description', 'media', 'dimensions', 'materials', 'preparation_days'] as const;
export type CreatorProductFields = Partial<{ name: string; description: string; short_description: string; materials: string; dimensions: string; preparation_days: number; media: { url: string; type: 'image' | 'video'; alt: string }[] }>;
export type CreatorProductInput = { product_id: string | null; fields: CreatorProductFields; proposed_price_paise: number | null };

function text(value: unknown, label: string, max: number, min = 0): string {
  if (typeof value !== 'string' || /[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) return bad(`${label} contains unsupported characters.`);
  const v = value.trim();
  if (v.length < min || v.length > max) return bad(min ? `${label} must be ${min}–${max} characters.` : `${label} must be at most ${max} characters.`);
  return v;
}

/**
 * @param mediaPrefix public URL prefix of the storage bucket the creator upload route writes to. Media must
 *   come from that pipeline (validated type and signature), never from arbitrary external links.
 */
export function validateCreatorProductInput(body: unknown, mediaPrefix: string): CreatorProductInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Invalid product details.');
  const b = body as Record<string, unknown>;
  const productId = b.product_id == null || b.product_id === '' ? null : typeof b.product_id === 'string' && UUID.test(b.product_id) ? b.product_id : bad('Invalid product.');
  const fields: CreatorProductFields = {};
  if (own(b, 'name')) fields.name = text(b.name, 'Title', 200, 2);
  if (own(b, 'description')) fields.description = text(b.description, 'Description', 20000);
  if (own(b, 'short_description')) fields.short_description = text(b.short_description, 'Short description', 500);
  if (own(b, 'materials')) fields.materials = text(b.materials, 'Materials', 2000);
  if (own(b, 'dimensions')) fields.dimensions = text(b.dimensions, 'Dimensions', 500);
  if (own(b, 'preparation_days')) {
    const days = typeof b.preparation_days === 'string' && b.preparation_days.trim() !== '' ? Number(b.preparation_days) : b.preparation_days;
    if (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 0 || days > 365) return bad('Preparation time must be 0–365 whole days.');
    fields.preparation_days = days;
  }
  if (own(b, 'media')) {
    if (!Array.isArray(b.media) || b.media.length > 12) return bad('Use at most 12 photos or videos.');
    fields.media = b.media.map(item => {
      if (!item || typeof item !== 'object') return bad('Invalid photo or video.');
      const m = item as Record<string, unknown>;
      if (typeof m.url !== 'string' || !mediaPrefix || !m.url.startsWith(mediaPrefix) || m.url.length > 2048 || /[\s"'<>\\]/.test(m.url) || m.url.slice(mediaPrefix.length).includes('..')) return bad('Upload photos and videos with the upload button.');
      if (m.type !== 'image' && m.type !== 'video') return bad('Invalid media type.');
      return { url: m.url, type: m.type, alt: m.alt == null ? '' : text(m.alt, 'Image description', 500) };
    });
    if (fields.media.filter(m => m.type === 'video').length > 2) return bad('Use at most two videos.');
  }
  if (!productId && !fields.name) return bad('A new product needs a title.');
  if (!Object.keys(fields).length && b.proposed_price_rupees == null) return bad('Nothing to save.');
  let proposed: number | null = null;
  if (b.proposed_price_rupees != null && b.proposed_price_rupees !== '') {
    const rupees = typeof b.proposed_price_rupees === 'string' ? Number(b.proposed_price_rupees) : b.proposed_price_rupees;
    if (typeof rupees !== 'number' || !Number.isFinite(rupees) || Math.abs(Math.round(rupees * 100) - rupees * 100) > 1e-6) return bad('Proposed price must be a rupee amount with up to two decimals.');
    proposed = Math.round(rupees * 100);
    if (proposed < 100 || proposed > 100000000) return bad('Proposed price must be between ₹1 and ₹10,00,000.');
  }
  return { product_id: productId, fields, proposed_price_paise: proposed };
}

export function creatorMediaPrefix(supabaseUrl: string | undefined, sandbox: boolean): string {
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${sandbox ? 'commerce-preview-media' : 'product-images'}/`;
}
