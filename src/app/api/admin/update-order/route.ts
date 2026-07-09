import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { OrderStatus } from '@/lib/types'
import { sendCustomerShippedWhatsApp, sendAdminShippedWhatsApp } from '@/lib/notifications'
import { sendCustomerShippingEmail } from '@/lib/email'

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:   ['paid'],
  paid:      ['shipped'],
  shipped:   ['delivered'],
  delivered: [],
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

  const { data: currentOrder, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', body.id)
    .single()

  if (fetchError || !currentOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  let triggerShippedNotifications = false

  if (body.status !== undefined) {
    const allowed = VALID_TRANSITIONS[currentOrder.status as OrderStatus] ?? []
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status transition: ${currentOrder.status} → ${body.status}` },
        { status: 400 }
      )
    }

    updates.status = body.status
    if (body.status === 'shipped' && currentOrder.status !== 'shipped') {
      triggerShippedNotifications = true
    }
    if (body.status === 'delivered') {
      updates.delivered_at = new Date().toISOString()
    }
  }

  if (body.tracking_number !== undefined) {
    updates.tracking_number = body.tracking_number
    // If tracking number is updated/added on a shipped order, trigger notification
    if (currentOrder.status === 'shipped' && currentOrder.tracking_number !== body.tracking_number) {
      triggerShippedNotifications = true;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updatedOrder, error } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single()

  if (error || !updatedOrder) {
    return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 })
  }

  // Trigger shipped notifications in parallel if requested
  if (triggerShippedNotifications) {
    await Promise.allSettled([
      sendCustomerShippedWhatsApp(updatedOrder),
      sendAdminShippedWhatsApp(updatedOrder),
      sendCustomerShippingEmail(updatedOrder)
    ])
  }

  return NextResponse.json({ order: updatedOrder })
}
