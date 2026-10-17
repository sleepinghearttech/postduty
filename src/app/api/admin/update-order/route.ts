import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { commerceTable } from '@/lib/commerce-db';
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { OrderUpdateError, planOrderUpdate } from '@/lib/order-status'
import { sendCustomerShippedWhatsApp, sendAdminShippedWhatsApp } from '@/lib/notifications'
import { sendCustomerShippingEmail } from '@/lib/email'
import type { Order } from '@/lib/types'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  if (!(await requireOwner(request)) || !isAllowedMutationOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 4000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (!body || typeof body.id !== 'string' || !uuid.test(body.id)) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { data: currentOrder, error: fetchError } = await supabaseAdmin
    .from(commerceTable('orders'))
    .select('*')
    .eq('id', body.id)
    .single()

  if (fetchError || !currentOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  try {
    const plan = planOrderUpdate(currentOrder as Order, body)

    if (plan.kind === 'cancel') {
      // One transaction: status check, stock (and variant stock) restoration and the status change.
      const { data, error } = await supabaseAdmin.rpc(commerceTable('cancel_paid_order'), { p_order_id: body.id })
      if (error || !data) {
        const conflict = error?.message?.includes('invalid_status_transition')
        return NextResponse.json({ error: conflict ? 'This order changed and can no longer be cancelled. Reload the page.' : 'The order could not be cancelled. Nothing was changed.' }, { status: conflict ? 409 : 500 })
      }
      return NextResponse.json({ order: data })
    }

    // Conditional update: a concurrent change (or a double-click) cannot apply twice.
    let query = supabaseAdmin
      .from(commerceTable('orders'))
      .update(plan.updates)
      .eq('id', body.id)
      .eq('status', (currentOrder as Order).status)
    if (plan.firstTracking) query = query.or('tracking_number.is.null,tracking_number.eq.')
    const { data: updatedOrder, error } = await query.select().maybeSingle()

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    if (!updatedOrder) return NextResponse.json({ error: 'This order changed while you were editing. Reload the page.' }, { status: 409 })

    // Sent once: only when tracking is first saved on a shipped order.
    if (plan.notifyShipped) {
      await Promise.allSettled([
        sendCustomerShippedWhatsApp(updatedOrder as Order),
        sendAdminShippedWhatsApp(updatedOrder as Order),
        sendCustomerShippingEmail(updatedOrder as Order),
      ])
    }

    return NextResponse.json({ order: updatedOrder })
  } catch (error) {
    if (error instanceof OrderUpdateError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
