import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import type { CreatorPickup } from '@/lib/types';

/** Owner-only: private pickup addresses for the given creators. Missing table (pre-migration) yields none. */
export async function loadCreatorPickups(creatorIds: (string | null | undefined)[]): Promise<CreatorPickup[]> {
  const ids = [...new Set(creatorIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (!ids.length) return [];
  const [pickups, creators] = await Promise.all([
    supabaseAdmin.from(commerceTable('creator_pickup_addresses')).select('creator_id,pickup_name,phone,address,pincode,shiprocket_location').in('creator_id', ids),
    supabaseAdmin.from(commerceTable('creators')).select('id,display_name').in('id', ids),
  ]);
  if (pickups.error || !pickups.data) return [];
  const names = new Map((creators.data ?? []).map(c => [c.id as string, c.display_name as string]));
  return (pickups.data as CreatorPickup[]).map(p => ({ ...p, display_name: names.get(p.creator_id) }));
}
