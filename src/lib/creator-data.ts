import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import type { CreatorFulfillment, FulfillmentStatus } from '@/lib/creator-types';

/** Fulfillment has one source of truth: order_items. Never copies customer records. */
export async function creatorFulfillment(creatorId?: string): Promise<CreatorFulfillment[]> {
  let query = supabaseAdmin.from(commerceTable('order_items')).select('*').not('creator_id', 'is', null).order('created_at', { ascending: false }).limit(200);
  if (creatorId) query = query.eq('creator_id', creatorId);
  const { data: items, error } = await query;
  if (error) throw new Error('Order items unavailable');
  if (!items?.length) return [];
  const orderIds = [...new Set(items.map(item => item.order_id))];
  // Only query shipping details for this creator's assigned items, after identity verification.
  type CreatorOrderRow = { id: string; status: string; customer_name: string; customer_phone: string; shipping_address: string | null; shipping_details?: { delivery_method?: string } | null; total_amount?: number; shipping_amount?: number | null; is_gift?: boolean; gift_message?: string | null; is_test: boolean };
  const orderQuery = async (columns: string) => {
    const result = await supabaseAdmin.from(commerceTable('orders')).select(columns).in('id', orderIds)
      .in('status', ['paid', 'shipped', 'delivered']).not('razorpay_payment_id', 'is', null);
    return { data: result.data as unknown as CreatorOrderRow[] | null, error: result.error };
  };
  let { data: orders, error: orderError } = await orderQuery('id,status,customer_name,customer_phone,shipping_address,shipping_details,total_amount,shipping_amount,is_gift,gift_message,is_test');
  // Older schemas lack the delivery/price columns; fall back to the original fields.
  if (orderError) ({ data: orders, error: orderError } = await orderQuery('id,status,customer_name,customer_phone,shipping_address,is_test'));
  if (orderError) throw new Error('Orders unavailable');
  // Whole-order totals are shown only for orders made entirely by this creator, so other creators' sales stay private.
  const { data: allLines } = await supabaseAdmin.from(commerceTable('order_items')).select('order_id,creator_id,combo_role').in('order_id', orderIds);
  const soleCreatorOrders = new Set(orderIds.filter(id => {
    const made = (allLines ?? []).filter(line => line.order_id === id && line.combo_role !== 'combo');
    return made.length > 0 && made.every(line => line.creator_id === creatorId);
  }));
  const orderMap = new Map((orders ?? []).map(order => [order.id, order]));
  const { data: products, error: productError } = await supabaseAdmin.from(commerceTable('products')).select('id,name').in('id', [...new Set(items.map(item => item.product_id))]);
  if (productError) throw new Error('Products unavailable');
  const names = new Map((products ?? []).map(product => [product.id, product.name]));
  return items.filter(item => orderMap.has(item.order_id)).map(item => {
    const order = orderMap.get(item.order_id)!;
    return {
      id: item.id, order_item_id: item.id, order_id: item.order_id, creator_id: item.creator_id,
      product_name: item.product_name || names.get(item.product_id) || 'Order item', quantity: item.quantity,
      requirements: { personalization: item.personalization || {}, variant_id: item.variant_id || null },
      status: (item.fulfillment_status === 'awaiting_acceptance' ? 'assigned' : item.fulfillment_status) as FulfillmentStatus,
      tracking_code: item.tracking_number || null, tracking_url: item.tracking_url || null,
      shipping_address: { name: order.customer_name, phone: order.customer_phone, address: order.shipping_address },
      delivery_method: order.shipping_details?.delivery_method === 'same_day' ? 'same_day' : 'standard',
      variant_name: item.variant_name || null,
      customer_paid_paise: typeof item.unit_price === 'number' ? item.unit_price * item.quantity - Math.max(0, item.line_discount_amount ?? 0) : null,
      order_total_paise: soleCreatorOrders.has(item.order_id) && typeof order.total_amount === 'number' ? order.total_amount : null,
      order_delivery_paise: soleCreatorOrders.has(item.order_id) && typeof order.shipping_amount === 'number' ? order.shipping_amount : null,
      gift: order.is_gift ? { message: order.gift_message || null } : null,
      creator_earning_paise: item.earnings_creator_id === item.creator_id && item.earnings_review_required === false ? item.creator_earning_paise ?? null : null,
      earnings_review_required: item.earnings_review_required !== false || item.earnings_creator_id !== item.creator_id, is_test: order.is_test === true,
      created_at: item.created_at, updated_at: item.updated_at || item.created_at,
    };
  });
}
