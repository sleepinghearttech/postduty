/** Owner coupon input validation (pure). Amounts arrive in paise; percent values are whole percents. */
export class CouponInputError extends Error {}
const bad = (message: string): never => { throw new CouponInputError(message); };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function paise(value: unknown, label: string, max = 50_000_000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return bad(`${label} must be a whole number of paise from 0 to ${max}.`);
  return value;
}
function expiry(value: unknown): string | null {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return bad('Expiry must be a valid date.');
  // A date picker value means "valid through that day" in India time, not until midnight UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999+05:30`).toISOString();
  return new Date(value).toISOString();
}
function maxUses(value: unknown): number | null {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) return bad('Maximum uses must be a whole number of at least 1, or empty for unlimited.');
  return value;
}
function discountValue(type: 'percent' | 'flat', value: unknown): number {
  if (type === 'percent') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 100) return bad('A percent discount must be a whole number from 1 to 100.');
    return value;
  }
  const v = paise(value, 'Flat discount');
  if (v < 100) return bad('A flat discount must be at least ₹1.');
  return v;
}

export type CouponCreate = { code: string; discount_type: 'percent' | 'flat'; discount_value: number; min_order: number; max_uses: number | null; expires_at: string | null; referrer_code: string | null };
export function validateCouponCreate(body: unknown): CouponCreate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Invalid coupon.');
  const b = body as Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
  // Matches what checkout accepts: up to 40 characters, no markup or control characters.
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return bad('Code must be 3–40 letters, numbers, hyphens or underscores.');
  if (b.discount_type !== 'percent' && b.discount_type !== 'flat') return bad('Choose a percent or flat discount.');
  const referrer = b.referrer_code == null || b.referrer_code === '' ? null : typeof b.referrer_code === 'string' ? b.referrer_code.trim().toLowerCase() : bad('Invalid referral code.');
  if (referrer !== null && !/^[a-z0-9_-]{2,40}$/.test(referrer)) return bad('Referral code must be 2–40 lowercase letters, numbers, hyphens or underscores.');
  return {
    code, discount_type: b.discount_type, discount_value: discountValue(b.discount_type, b.discount_value),
    min_order: b.min_order == null ? 0 : paise(b.min_order, 'Minimum order'), max_uses: maxUses(b.max_uses), expires_at: expiry(b.expires_at), referrer_code: referrer,
  };
}

/** Partial update; the discount type cannot change, so the value is validated against the stored type. */
export function validateCouponUpdate(body: unknown, currentType: 'percent' | 'flat'): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Invalid coupon.');
  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (own(b, 'is_active')) { if (typeof b.is_active !== 'boolean') return bad('Active must be true or false.'); updates.is_active = b.is_active; }
  if (own(b, 'discount_value')) updates.discount_value = discountValue(currentType, b.discount_value);
  if (own(b, 'min_order')) updates.min_order = paise(b.min_order, 'Minimum order');
  if (own(b, 'max_uses')) updates.max_uses = maxUses(b.max_uses);
  if (own(b, 'expires_at')) updates.expires_at = expiry(b.expires_at);
  if (!Object.keys(updates).length) return bad('Nothing to update.');
  return updates;
}
