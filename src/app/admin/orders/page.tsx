import { requireOwner } from '@/lib/commerce-auth';
import { redirect } from 'next/navigation';
import { commerceTable } from '@/lib/commerce-db';
import { supabaseAdmin } from '@/lib/supabase'
import { OrderWithItems } from '@/lib/types'
import { OrdersClient } from './OrdersClient'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage() {
  if (!await requireOwner()) redirect('/admin/login');
  const { data, error } = await supabaseAdmin
    .from(commerceTable('orders'))
    .select(`
      *,
      order_items:${commerceTable("order_items")} (
        id,
        quantity,
        unit_price,
        products:${commerceTable("products")} ( name )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-8 text-red-600 text-sm">
        Failed to load orders: {error.message}
      </div>
    )
  }

  return <OrdersClient initialOrders={(data as unknown as OrderWithItems[]) ?? []} />
}
