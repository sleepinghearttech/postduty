import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { summarizeAudience, type AudienceEvent, type AudienceOrder } from '@/lib/business/audience';
import type { BusinessRange } from '@/lib/business/metrics';

const EVENT_CAP = 20000;

/** Loads traffic events and paid orders (with their checkout attribution) for one range and payment mode. */
export async function loadAudience(range: BusinessRange, mode: 'test'|'live') {
  const events: AudienceEvent[] = [];
  let eventsTruncated = false, eventsUnavailable = false;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(commerceTable('site_events')).select('created_at,event,session_id,path,source,device,city,region,landing_path')
      .gte('created_at', range.start).lt('created_at', range.end).order('created_at', { ascending: true }).range(from, from + 999);
    if (error) { eventsUnavailable = true; break; }
    events.push(...((data ?? []) as AudienceEvent[]));
    if (!data || data.length < 1000) break;
    if (events.length >= EVENT_CAP) { eventsTruncated = true; break; }
  }
  const { data: orderRows, error: orderError } = await supabaseAdmin.from(commerceTable('orders')).select('id,created_at,total_amount,shipping_details,checkout_intent_id,payment_mode')
    .gte('created_at', range.start).lt('created_at', range.end).eq('is_test', mode === 'test').in('status', ['paid', 'shipped', 'delivered']).limit(5000);
  const rows = (orderRows ?? []) as { id: string; created_at: string; total_amount: number; shipping_details: { pincode?: unknown } | null; checkout_intent_id: string | null; payment_mode: string | null }[];
  const live = rows.filter(r => r.payment_mode == null || r.payment_mode === mode);
  const intentIds = [...new Set(live.flatMap(r => r.checkout_intent_id ? [r.checkout_intent_id] : []))];
  const attributions = new Map<string, AudienceOrder['attribution']>();
  for (let i = 0; i < intentIds.length; i += 100) {
    const { data } = await supabaseAdmin.from(commerceTable('checkout_intents')).select('id,attribution').in('id', intentIds.slice(i, i + 100));
    for (const row of (data ?? []) as { id: string; attribution: AudienceOrder['attribution'] }[]) attributions.set(row.id, row.attribution);
  }
  const orders: AudienceOrder[] = live.map(r => ({
    id: r.id, created_at: r.created_at, total_amount: r.total_amount,
    pincode: typeof r.shipping_details?.pincode === 'string' ? r.shipping_details.pincode : null,
    attribution: r.checkout_intent_id ? attributions.get(r.checkout_intent_id) ?? null : null,
  }));
  return { summary: summarizeAudience(events, orders), eventsTruncated, eventsUnavailable, ordersUnavailable: !!orderError };
}
