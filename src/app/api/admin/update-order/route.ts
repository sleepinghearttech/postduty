import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { commerceTable } from '@/lib/commerce-db';
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { CLAWBACK_REQUIRED, OrderUpdateError, planOrderUpdate } from '@/lib/order-status'
import { sendCustomerShippedWhatsApp, sendAdminShippedWhatsApp } from '@/lib/notifications'
import { sendCustomerShippingEmail } from '@/lib/email'
import type { Order } from '@/lib/types'
import { parseCourierCost } from '@/lib/creator-payouts'

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

  // Actual courier cost (owner-entered) is a separate edit; it feeds creator payouts only.
  if (body.courier_cost_rupees !== undefined) {
    if (body.status !== undefined || body.tracking_number !== undefined) return NextResponse.json({ error: 'Save the courier cost separately.' }, { status: 400 })
    if (['pending'].includes((currentOrder as Order).status)) return NextResponse.json({ error: 'Courier cost can be recorded once the order is paid.' }, { status: 400 })
    let courier: number | null
    try { courier = parseCourierCost(body.courier_cost_rupees) } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }) }
    const { data, error } = await supabaseAdmin.from(commerceTable('orders')).update({ courier_cost_paise: courier }).eq('id', body.id).select().maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'The courier cost could not be saved.' }, { status: 500 })
    return NextResponse.json({ order: data })
  }

  try {
    // Settled lines are frozen. The SQL functions re-check this inside their transaction.
    let settledLines = false
    if (body.status === 'cancelled' || body.status === 'refunded') {
      const settled = await supabaseAdmin.from(commerceTable('order_items')).select('id').eq('order_id', body.id).not('settlement_id', 'is', null).limit(1)
      if (settled.error && settled.error.code !== '42703') return NextResponse.json({ error: 'Order lines are unavailable. Nothing was changed.' }, { status: 503 })
      settledLines = !settled.error && (settled.data?.length ?? 0) > 0
    }
    const plan = planOrderUpdate(currentOrder as Order, body, new Date(), settledLines)

    if (plan.kind === 'cancel' || plan.kind === 'refund') {
      // One transaction: status check, settled-line guard, stock (and variant stock) restoration when not yet
      // shipped, coupon-use reversal and the status change.
      const fn = plan.kind === 'cancel' ? 'cancel_paid_order' : 'refund_order'
      const { data, error } = await supabaseAdmin.rpc(commerceTable(fn), { p_order_id: body.id })
      if (error || !data) {
        if (error?.message?.includes('settled_lines_require_clawback')) return NextResponse.json({ error: CLAWBACK_REQUIRED }, { status: 409 })
        const conflict = error?.message?.includes('invalid_status_transition')
        const verb = plan.kind === 'cancel' ? 'cancelled' : 'recorded as refunded'
        return NextResponse.json({ error: conflict ? `This order changed and can no longer be ${verb}. Reload the page.` : `The order could not be ${verb}. Nothing was changed.` }, { status: conflict ? 409 : 500 })
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
