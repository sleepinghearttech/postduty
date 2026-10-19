/** Owner-approved public creator profile and private pickup address. Pure validation, no I/O. */

export class CreatorProfileError extends Error {}
const bad = (message: string): never => { throw new CreatorProfileError(message); };
function text(value: unknown, label: string, max: number, min = 0): string {
  if (value == null) value = '';
  if (typeof value !== 'string' || /[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) return bad(`${label} contains unsupported characters.`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) return bad(min ? `${label} must be ${min}–${max} characters.` : `${label} must be at most ${max} characters.`);
  return cleaned;
}

/** The only creator fields readable by the public storefront (enforced again by a column grant). */
export const PUBLIC_CREATOR_COLUMNS = 'id,display_name,bio,photo_url,profession' as const;
export type PublicCreatorProfile = { id: string; display_name: string; bio: string | null; photo_url: string | null; profession: string | null };
export type CreatorProfileUpdate = { display_name: string; bio: string; photo_url: string | null; profession: string | null; profile_published: boolean };

export function validateCreatorProfile(body: Record<string, unknown>): CreatorProfileUpdate {
  const display_name = text(body.display_name, 'Display name', 100, 2);
  const bio = text(body.bio, 'Short story', 600);
  const profession = text(body.profession, 'Profession', 80) || null;
  const photo = text(body.photo_url, 'Photo URL', 2048);
  let photo_url: string | null = null;
  if (photo) {
    try {
      const url = new URL(photo);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      photo_url = url.href;
    } catch { return bad('The photo must be an https:// image link.'); }
  }
  if (typeof body.profile_published !== 'boolean') return bad('Choose whether the profile is shown on product pages.');
  // Publishing needs only the display name; story and profession are optional.
  return { display_name, bio, photo_url, profession, profile_published: body.profile_published };
}

/** Storefront credit: exactly "Made by <display_name>". Profession is an admin-only field and is never shown. */
export function madeByLine(profile: Pick<PublicCreatorProfile, 'display_name'>): string {
  return `Made by ${profile.display_name.trim()}`;
}
/** The story is shown under the credit only when it has content. */
export function creatorStory(profile: Pick<PublicCreatorProfile, 'bio'>): string | null {
  const story = profile.bio?.trim();
  return story ? story : null;
}

/** Columns the storefront reads: profession is deliberately excluded. */
export const STOREFRONT_CREATOR_COLUMNS = 'id,display_name,bio,photo_url' as const;
export type StorefrontCreatorProfile = Omit<PublicCreatorProfile, 'profession'>;

export type PickupAddress = { pickup_name: string; phone: string; address: string; pincode: string; shiprocket_location: string | null };
export function validatePickupAddress(body: Record<string, unknown>): PickupAddress {
  const pickup_name = text(body.pickup_name, 'Pickup contact name', 100, 2);
  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  let digits = rawPhone.replace(/[\s()-]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3); else if (/^91\d{10}$/.test(digits)) digits = digits.slice(2); else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return bad('Enter a valid 10-digit Indian mobile number for pickup.');
  const address = text(body.address, 'Pickup address', 500, 10);
  const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
  if (!/^[1-9]\d{5}$/.test(pincode)) return bad('Enter a valid 6-digit pickup PIN code.');
  const location = text(body.shiprocket_location, 'Shiprocket pickup location', 64);
  if (location && !/^[A-Za-z0-9 _-]+$/.test(location)) return bad('The Shiprocket pickup location may contain letters, numbers, spaces, hyphens and underscores.');
  return { pickup_name, phone: digits, address, pincode, shiprocket_location: location || null };
}
