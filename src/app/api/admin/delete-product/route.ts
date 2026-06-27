import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const session = request.cookies.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json() as { id: string }

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Check whether any past order contains this product.
  // If yes, refuse deletion — deleting would break order history.
  const { count, error: checkError } = await supabaseAdmin
    .from('order_items')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', id)

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 })
  }

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: this product appears in ${count} past order(s).`,
        suggestion: 'Set is_active = false to hide it from the storefront instead.',
      },
      { status: 409 }
    )
  }

  const { error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
