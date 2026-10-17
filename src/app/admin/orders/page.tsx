import { requireOwner } from '@/lib/commerce-auth';
import { redirect } from 'next/navigation';
import { commerceTable } from '@/lib/commerce-db';
import { supabaseAdmin } from '@/lib/supabase'
import { missingColumn } from '@/lib/business/queries'
import type { CreatorPickup, OrderWithItems } from '@/lib/types'
import { loadCreatorPickups } from '@/lib/creator-pickups'
import { OrdersClient } from './OrdersClient'
import type { OrderCase } from '@/lib/order-cases'

export const dynamic = 'force-dynamic'

// Newest projection first; older ones keep the page working before the additive migrations are applied.
const itemProjections = [
  'id,quantity,unit_price,product_name,variant_id,variant_name,personalization,creator_id',
  'id,quantity,unit_price,product_name,variant_id,variant_name,personalization',
  'id,quantity,unit_price,product_name,variant_id,personalization',
  'id,quantity,unit_price',
]

export default async function AdminOrdersPage() {
  if (!await requireOwner()) redirect('/admin/login');
  let result: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null }
  for (const projection of itemProjections) {
    result = await supabaseAdmin
      .from(commerceTable('orders'))
      .select(`*, order_items:${commerceTable('order_items')} ( ${projection}, products:${commerceTable('products')} ( name ) )`)
      .order('created_at', { ascending: false })
    if (!result.error || !missingColumn(result.error)) break
  }
  const { data, error } = result

  if (error) {
    return (
      <div className="p-8 text-red-600 text-sm">
        Failed to load orders: {error.message}
      </div>
    )
  }

  const { data: serviceCases, error: casesError } = await supabaseAdmin
    .from(commerceTable('order_cases')).select('*').order('created_at', { ascending: false }).limit(500);

  const orders = (data as unknown as OrderWithItems[]) ?? []
  // Private pickup addresses, only for creators who supply lines in these orders.
  const pickups: CreatorPickup[] = await loadCreatorPickups(orders.flatMap(order => order.order_items.map(item => item.creator_id ?? null)))

  return <OrdersClient pickups={pickups} initialOrders={orders} initialCases={(serviceCases as OrderCase[]) ?? []} casesUnavailable={Boolean(casesError)} />
}
