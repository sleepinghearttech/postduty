import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { istWeek, payoutConfig, weeklyStatement, type PayoutItem, type PayoutOrder, type WeeklyStatement } from '@/lib/creator-payouts';

/** Server-side weekly statement: always recomputed from orders, never from client-supplied amounts. */
export async function loadWeeklyStatement(creatorId: string, week: string): Promise<WeeklyStatement> {
  const range = istWeek(week);
  const config = payoutConfig(process.env);
  const { data: lines, error } = await supabaseAdmin.from(commerceTable('order_items'))
    .select('id,order_id,creator_id,line_index,quantity,product_name,settlement_id,creator_payout_paise')
    .eq('creator_id', creatorId).limit(2000);
  if (error) throw new Error('Order items unavailable');
  const orderIds = [...new Set((lines ?? []).map(line => line.order_id as string))];
  if (!orderIds.length) return weeklyStatement(creatorId, week, [], [], config);
  const { data: orders, error: orderError } = await supabaseAdmin.from(commerceTable('orders'))
    .select('id,status,created_at,courier_cost_paise,tax_breakdown')
    .in('id', orderIds).not('checkout_intent_id', 'is', null)
    .gte('created_at', range.fromIso).lt('created_at', range.toIso);
  if (orderError) throw new Error('Orders unavailable');
  const normalized = (orders ?? []).map(o => ({ ...o, created_at: new Date(o.created_at as string).toISOString() })) as PayoutOrder[];
  return weeklyStatement(creatorId, week, normalized, (lines ?? []) as PayoutItem[], config);
}
