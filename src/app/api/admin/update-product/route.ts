import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const session = request.cookies.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    id: string
    name?: string
    price?: number      // rupees — converted to paise below
    description?: string
    stock?: number
    image_url?: string
    is_active?: boolean
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Build an object with only the fields that were actually sent
  // so we never accidentally overwrite something with undefined
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined)        updates.name = body.name
  if (body.price !== undefined)       updates.price = Math.round(body.price * 100)
  if (body.description !== undefined) updates.description = body.description
  if (body.stock !== undefined)       updates.stock = body.stock
  if (body.image_url !== undefined)   updates.image_url = body.image_url
  if (body.is_active !== undefined)   updates.is_active = body.is_active

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ product: data })
}
