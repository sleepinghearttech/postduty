import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { OrderStatus } from '@/lib/types'

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid'],
  paid:    ['shipped'],
  shipped: [],
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    id: string
    status?: OrderStatus
    tracking_number?: string
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (body.status !== undefined) {
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', body.id)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const allowed = VALID_TRANSITIONS[current.status as OrderStatus] ?? []
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status transition: ${current.status} → ${body.status}` },
        { status: 400 }
      )
    }

    updates.status = body.status
  }

  if (body.tracking_number !== undefined) {
    updates.tracking_number = body.tracking_number
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ order: data })
}
