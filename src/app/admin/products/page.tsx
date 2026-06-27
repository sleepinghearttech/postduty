import { supabaseAdmin } from '@/lib/supabase'
import { Product } from '@/lib/types'
import { ProductsClient } from './ProductsClient'

// Always fetch fresh — never cache this page
export const dynamic = 'force-dynamic'

export default async function AdminProductsPage() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-8 text-red-600 text-sm">
        Failed to load products: {error.message}
      </div>
    )
  }

  return <ProductsClient initialProducts={(data as Product[]) ?? []} />
}
