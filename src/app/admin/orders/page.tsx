import { supabaseAdmin } from '@/lib/supabase'
import { OrderWithItems } from '@/lib/types'
import { OrdersClient } from './OrdersClient'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage() {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      order_items (
        id,
        quantity,
        unit_price,
        products ( name )
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

  return <OrdersClient initialOrders={(data as OrderWithItems[]) ?? []} />
}
