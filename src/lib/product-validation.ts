import type { OwnerProduct, Product, ProductCommerce, ProductMedia, ProductVariant } from './types';

export class ProductValidationError extends Error {}
/** Mirrors GST_RATE_BPS in checkout-contract (kept local so this module stays dependency-free). */
export const GST_RATES_BPS: readonly number[] = [0,10,25,150,300,500,1200,1800,2800,4000];
const bad = (message: string): never => { throw new ProductValidationError(message); };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, label: string, max = 200, required = false): string {
  if (typeof value !== 'string') return bad(`${label} must be text.`);
  const cleaned = value.trim();
  if (cleaned.length > max || (required && !cleaned)) return bad(`${label} ${required ? 'is required and ' : ''}must be at most ${max} characters.`);
  return cleaned;
}
function integer(value: unknown, label: string, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return bad(`${label} must be a non-negative whole number.`);
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return bad(`${label} must be true or false.`);
  return value;
}
export function safeMediaUrl(value: unknown): string {
  const url = text(value, 'Media URL', 2048, true);
  if (/^\/(?!\/)[A-Za-z0-9_./%?=&+-]+$/.test(url) && !url.includes('..') && !url.includes('\\')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return url;
  } catch { /* reported below */ }
  return bad('Media must use an HTTPS URL or a local asset path.');
}
function strings(value: unknown, label: string, count = 30): string[] {
  if (!Array.isArray(value) || value.length > count) return bad(`${label} must contain at most ${count} entries.`);
  return [...new Set(value.map(item => text(item, label, 120, true)))];
}
export function validateCommerce(value: unknown): ProductCommerce {
  if (!isRecord(value)) return bad('Product details must be an object.');
  const result: ProductCommerce = {};
  for (const key of ['sku','category','short_description','materials','seo_title','seo_description','dimensions','shipping_method'] as const) {
    if (own(value, key)) result[key] = text(value[key], key.replaceAll('_',' '), key === 'materials' ? 2000 : 500);
  }
  for (const key of ['collections','tags'] as const) if (own(value,key)) result[key] = strings(value[key],key);
  if (own(value,'storefronts')) {
    const storefronts = strings(value.storefronts,'Storefronts',2);
    if (storefronts.some(x => x !== 'general' && x !== 'christmas')) return bad('Select General store, Christmas, or both.');
    result.storefronts = storefronts as ProductCommerce['storefronts'];
  }
  for (const key of ['made_to_order','featured','archived','catalog_only'] as const) if (own(value,key)) result[key] = boolean(value[key],key);
  for (const key of ['preparation_days','capacity','low_stock_threshold','weight_grams'] as const) if (own(value,key)) result[key] = integer(value[key],key,1000000);
  if (own(value,'hsn') && value.hsn !== '') {
    const hsn = text(value.hsn,'HSN code',8);
    if (!/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) return bad('HSN code must be 4, 6 or 8 digits.');
    result.hsn = hsn;
  }
  if (own(value,'gst_rate_bps') && value.gst_rate_bps !== null) {
    // Basis points keep the rate an exact integer (18% = 1800). Standard Indian GST slabs only.
    if (!GST_RATES_BPS.includes(value.gst_rate_bps as number)) return bad('GST rate must be one of 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28 or 40 percent.');
    result.gst_rate_bps = value.gst_rate_bps as number;
  }
  if (own(value,'media')) {
    if (!Array.isArray(value.media) || value.media.length > 12) return bad('A product supports up to 12 media files.');
    result.media = value.media.map((item): ProductMedia => {
      if (!isRecord(item) || (item.type !== 'image' && item.type !== 'video')) return bad('Invalid media type.');
      return { url: safeMediaUrl(item.url), type: item.type, alt: text(item.alt ?? '', 'Image description', 500), ...(item.attribution ? { attribution: text(item.attribution, 'Attribution', 500) } : {}) };
    });
    if (result.media.filter(x => x.type === 'video').length > 2) return bad('A product supports up to two videos.');
  }
  if (own(value,'variants')) {
    if (!Array.isArray(value.variants) || value.variants.length > 100) return bad('A product supports up to 100 variants.');
    result.variants = value.variants.map((item): ProductVariant => {
      if (!isRecord(item)) return bad('Invalid variant.');
      const id = text(item.id, 'Variant ID', 80, true);
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) return bad('Variant ID may contain letters, numbers, hyphens and underscores.');
      return { id, name: text(item.name, 'Variant name', 120, true), price: integer(item.price, 'Variant price in paise'), stock: integer(item.stock, 'Variant stock', 1000000), ...(item.sku ? { sku: text(item.sku,'Variant SKU',120) } : {}) };
    });
    if (new Set(result.variants.map(v => v.id)).size !== result.variants.length) return bad('Variant IDs must be unique.');
  }
  if (own(value,'personalization')) {
    const p = value.personalization;
    if (!isRecord(p)) return bad('Personalization must be an object.');
    result.personalization = { enabled: boolean(p.enabled,'Personalization'), label: text(p.label,'Personalization label',200), max_length: integer(p.max_length,'Personalization maximum length',1000), required: boolean(p.required,'Personalization required') };
    if (result.personalization.enabled && (!result.personalization.label || result.personalization.max_length < 1)) return bad('Personalization needs a label and a maximum length.');
  }
  if (own(value,'faqs')) {
    if (!Array.isArray(value.faqs) || value.faqs.length > 20) return bad('A product supports up to 20 FAQs.');
    result.faqs = value.faqs.map(faq => {
      if (!isRecord(faq)) return bad('Invalid FAQ.');
      return { question: text(faq.question,'FAQ question',300,true), answer: text(faq.answer,'FAQ answer',2000,true) };
    });
  }
  return result;
}
export function validateOperations(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return bad('Private product information must be an object.');
  const encoded = JSON.stringify(value);
  if (encoded.length > 24000) return bad('Private product information is too large.');
  const check = (node: unknown, depth: number): void => {
    if (depth > 5) return bad('Private product information is too deeply nested.');
    if (typeof node === 'number' && !Number.isFinite(node)) return bad('Costs must be finite numbers.');
    if (isRecord(node)) for (const [key, child] of Object.entries(node)) {
      if (['__proto__','constructor','prototype'].includes(key)) return bad('Invalid private information key.');
      check(child, depth + 1);
    }
    else if (Array.isArray(node)) node.forEach(child => check(child, depth + 1));
  };
  check(value,0);
  if (value.costs_rupees !== undefined) {
    if (!isRecord(value.costs_rupees)) return bad('Recorded costs must be an object.');
    for (const cost of Object.values(value.costs_rupees)) if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || cost > 21474836.47) return bad('Recorded costs must be non-negative rupee amounts.');
  }
  for (const key of ['proposed_price_rupees','handmade_material_cost_rupees','filament_cost_rupees','labor_hours','handmade_production_hours','creator_capacity','filament_weight_grams','print_duration_hours','electricity_estimate_rupees','hardware_cost_rupees','failure_allowance_percent']) {
    if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0)) return bad(`${key.replaceAll('_',' ')} must be non-negative.`);
  }
  if (value.commission_percent !== undefined && (typeof value.commission_percent !== 'number' || !Number.isFinite(value.commission_percent) || value.commission_percent < 0 || value.commission_percent > 100)) return bad('Commission must be between 0 and 100 percent.');
  if (value.license_status !== undefined && !['owned','commercial_license','permission_verified','not_required','unverified'].includes(String(value.license_status))) return bad('Select a valid commercial license status.');
  return JSON.parse(encoded) as Record<string,unknown>;
}
export function productSlug(value: unknown): string {
  const slug = text(value,'Product URL',160,true).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return bad('Product URL may contain lowercase letters, numbers and single hyphens.');
  return slug;
}
export function validateProductInput(body: unknown, existing?: Product): Partial<Product> {
  if (!isRecord(body)) return bad('Product information must be an object.');
  const result: Partial<Product> = {};
  if (!existing || own(body,'name')) result.name = text(body.name, 'Product name', 200, true);
  if (own(body,'slug') && body.slug !== '') result.slug = productSlug(body.slug);
  if (own(body,'description')) result.description = body.description == null ? null : text(body.description,'Description',20000);
  if (own(body,'customisation_note')) result.customisation_note = body.customisation_note == null ? null : text(body.customisation_note,'Private sourcing note',4000);
  if (!existing || own(body,'price')) {
    const rupees = body.price ?? 0;
    if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees < 0 || Math.abs(Math.round(rupees*100)-rupees*100) > 0.00001) return bad('Price must be a valid rupee amount with no more than two decimal places.');
    result.price = integer(Math.round(rupees*100),'Price in paise');
  }
  if (!existing || own(body,'stock')) result.stock = integer(body.stock ?? 0,'Stock',1000000);
  if (own(body,'image_url')) result.image_url = body.image_url ? safeMediaUrl(body.image_url) : null;
  if (own(body,'commerce')) result.commerce = validateCommerce(body.commerce);
  if (own(body,'creator_id')) {
    if (body.creator_id != null && (typeof body.creator_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.creator_id))) return bad('Creator identifier is invalid.');
    result.creator_id = body.creator_id as string | null;
  }
  // is_active is deliberately ignored; only the explicit publishing action changes it.
  return result;
}
export function validatePublication(product: Pick<OwnerProduct,'name'|'price'|'image_url'|'commerce'|'operations'>): void {
  if (!product.name.trim() || product.price <= 0) return bad('Publishing needs a name and an approved selling price above zero.');
  if (!product.image_url && !product.commerce?.media?.some(m => m.type === 'image')) return bad('Add a product photo before publishing.');
  if (!product.commerce?.storefronts?.length) return bad('Select at least one storefront before publishing.');
  if (product.commerce.archived) return bad('An archived product cannot be published.');
  if (!(product.commerce.catalog_only === true && product.operations?.catalog_display_approved === true) && !['owned','commercial_license','permission_verified','not_required'].includes(String(product.operations?.license_status))) return bad('Confirm commercial design rights before publishing.');
  if (product.commerce.variants?.some(variant => variant.price <= 0)) return bad('Every variant needs an approved selling price above zero.');
}
export function validateMediaFile(type: string, bytes: Uint8Array): { type: 'image'|'video'; extension: string } {
  const max = type.startsWith('video/') ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (!bytes.length || bytes.length > max) return bad(type.startsWith('video/') ? 'Videos must be 25 MB or smaller.' : 'Photos must be 8 MB or smaller.');
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start,start+length));
  const formats: Record<string, { extension: string; valid: boolean }> = {
    'image/jpeg': { extension: 'jpg', valid: bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff },
    'image/png': { extension: 'png', valid: [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b) },
    'image/gif': { extension: 'gif', valid: ['GIF87a','GIF89a'].includes(ascii(0,6)) },
    'image/webp': { extension: 'webp', valid: ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP' },
    'video/mp4': { extension: 'mp4', valid: ascii(4,4)==='ftyp' && bytes.length > 16 },
    'video/webm': { extension: 'webm', valid: [0x1a,0x45,0xdf,0xa3].every((b,i)=>bytes[i]===b) && bytes.length > 16 },
  };
  const format = formats[type];
  if (!format?.valid) return bad('Use a valid JPEG, PNG, WebP, GIF, MP4 or WebM file.');
  return { type: type.startsWith('video/') ? 'video' : 'image', extension: format.extension };
}
