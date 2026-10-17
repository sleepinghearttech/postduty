'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Order, OrderWithItems, OrderStatus, type CreatorPickup } from '@/lib/types'
import type { OrderCase } from '@/lib/order-cases'
import { OrderCases } from './OrderCases'
import { describeOrderLine } from '@/lib/order-status'

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatRupees(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

// ─── status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  paid:      'bg-blue-100 text-blue-700',
  shipped:   'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-200 text-gray-700',
  refunded:  'bg-rose-100 text-rose-700',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'Pending',
  paid:      'Paid — ready to ship',
  shipped:   'Shipped',
  delivered: 'Delivered ✓',
  cancelled: 'Cancelled — stock restored',
  refunded:  'Refunded',
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── stats bar ───────────────────────────────────────────────────────────────

function StatsBar({ orders }: { orders: OrderWithItems[] }) {
  const totalOrders = orders.length
  const awaitingShipment = orders.filter(o => o.status === 'paid').length
  const totalRevenuePaise = orders
    .filter(o => o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered')
    .reduce((sum, o) => sum + o.total_amount, 0)

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <StatCard label="Total orders" value={String(totalOrders)} />
      <StatCard
        label="Awaiting shipment"
        value={String(awaitingShipment)}
        highlight={awaitingShipment > 0}
      />
      <StatCard label="Recorded order value" value={formatRupees(totalRevenuePaise)} />
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}

// ─── order card ──────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onUpdate,
  cases,
  casesUnavailable,
  pickups,
}: {
  order: OrderWithItems
  onUpdate: (updated: OrderWithItems) => void
  cases: OrderCase[]
  casesUnavailable: boolean
  pickups: CreatorPickup[]
}) {
  const [courierInput, setCourierInput] = useState(order.courier_cost_paise == null ? '' : String(order.courier_cost_paise / 100))
  const [savingCourier, setSavingCourier] = useState(false)
  const linePickups = pickups.filter(p => order.order_items.some(i => i.creator_id === p.creator_id))
  const missingPickup = order.order_items.some(i => i.creator_id && !pickups.some(p => p.creator_id === i.creator_id))

  async function handleSaveCourier() {
    setSavingCourier(true)
    const res = await fetch('/api/admin/update-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: order.id, courier_cost_rupees: courierInput.trim() === '' ? null : Number(courierInput) }),
    })
    const json = await res.json() as { order?: Order; error?: string }
    if (json.order) { onUpdate({ ...json.order, order_items: order.order_items }); showFlash('Courier cost saved') }
    else showFlash('Error: ' + (json.error ?? 'unknown'))
    setSavingCourier(false)
  }
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [trackingInput, setTrackingInput] = useState(order.tracking_number ?? '')
  const [savingTracking, setSavingTracking] = useState(false)

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (newStatus === 'cancelled' && !window.confirm('Cancel this order, return its items to stock and release any coupon use? This does not refund the payment.')) return
    if (newStatus === 'refunded' && !window.confirm('Record this order as refunded? Make the refund in the payment provider dashboard first; this only records it. Items not yet shipped return to stock and any coupon use is released.')) return
    setSaving(true)
    const res = await fetch('/api/admin/update-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: order.id, status: newStatus }),
    })
    const json = await res.json() as { order?: Order; error?: string }
    if (json.order) {
      onUpdate({ ...json.order, order_items: order.order_items })
      showFlash('Status updated')
    } else {
      showFlash('Error: ' + (json.error ?? 'unknown'))
    }
    setSaving(false)
  }

  async function handleSaveTracking() {
    const value = trackingInput.trim()
    if (!value) return
    setSavingTracking(true)
    const res = await fetch('/api/admin/update-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: order.id, tracking_number: value }),
    })
    const json = await res.json() as { order?: Order; error?: string }
    if (json.order) {
      onUpdate({ ...json.order, order_items: order.order_items })
      showFlash('Tracking saved')
    } else {
      showFlash('Error: ' + (json.error ?? 'unknown'))
    }
    setSavingTracking(false)
  }

  const items = order.order_items.map(i => describeOrderLine(i))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-400 font-mono tracking-wider">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {order.is_gift && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700" title={order.gift_message || 'Gift order'}>
              🎁 Gift
            </span>
          )}
          {order.coupon_code && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
              🏷️ {order.coupon_code}
            </span>
          )}
          <span className="text-xs text-gray-500">{order.is_test || order.payment_mode === 'test' ? 'Test order' : order.payment_mode === 'live' ? 'Live payment mode' : 'Historical mode unverified'}</span>
          <StatusBadge status={order.status as OrderStatus} />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Customer
          </p>
          <p className="font-medium text-gray-800">{order.customer_name}</p>
          <p className="text-gray-500">{order.customer_email}</p>
          <p className="text-gray-500">{order.customer_phone}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Ship to
          </p>
          <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">
            {order.shipping_address}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Items
          </p>
          {items.map((item, i) => (
            <p key={i} className="text-gray-700 break-words">
              {item}
            </p>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Total
          </p>
          <p className="text-lg font-bold text-gray-900">{formatRupees(order.total_amount)}</p>
          {(order.shipping_amount ?? 0) > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">Includes shipping: {formatRupees(order.shipping_amount ?? 0)}</p>
          )}
          {order.discount_amount > 0 && (
            <p className="text-xs text-green-600 mt-0.5">Discount: -{formatRupees(order.discount_amount)}</p>
          )}
          {order.is_gift && order.gift_message && (
            <p className="text-xs text-amber-600 mt-1 italic">&quot;{ order.gift_message}&quot;</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {order.status === 'pending' && <span className="text-xs text-amber-700">Awaiting provider verification. Payment status cannot be set manually.</span>}
          {order.status === 'paid' && (
            <button
              onClick={() => handleStatusChange('shipped')}
              disabled={saving}
              className="text-sm px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Mark as shipped ↗'}
            </button>
          )}
          {order.status === 'shipped' && (
            <button
              onClick={() => handleStatusChange('delivered')}
              disabled={saving}
              className="text-sm px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Mark as delivered ✓'}
            </button>
          )}
          {order.status === 'delivered' && (
            <span className="text-xs text-emerald-600 italic">Delivery recorded. Notification delivery is tracked separately.</span>
          )}
          {order.status === 'paid' && (
            <button
              onClick={() => handleStatusChange('cancelled')}
              disabled={saving}
              className="text-sm px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel order
            </button>
          )}
          {(order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered') && (
            <button
              onClick={() => handleStatusChange('refunded')}
              disabled={saving}
              className="text-sm px-4 py-1.5 border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-50 disabled:opacity-50 transition-colors"
            >
              Record refund
            </button>
          )}
          {order.status !== 'pending' && (
            <Link href={`/admin/orders/${order.id}/packing-slip`} target="_blank" rel="noopener" className="text-sm underline text-gray-600">
              Packing slip
            </Link>
          )}
          {order.invoice_number && (
            <Link href={`/admin/orders/${order.id}/invoice`} target="_blank" rel="noopener" className="text-sm underline text-gray-600">
              Invoice {order.invoice_number}
            </Link>
          )}
          {flash && (
            <span
              className={`text-xs ${flash.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}
            >
              {flash}
            </span>
          )}
        </div>

        {/* Tracking input — visible once shipped or delivered */}
        {(order.status === 'shipped' || order.status === 'delivered') && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={trackingInput}
                onChange={e => setTrackingInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveTracking()}
                placeholder="Shiprocket AWB / tracking number"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                onClick={handleSaveTracking}
                disabled={savingTracking || !trackingInput.trim()}
                className="text-sm px-4 py-1.5 bg-brand text-white rounded-lg hover:bg-brand-dark disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {savingTracking ? 'Saving…' : 'Save tracking'}
              </button>
            </div>
            {!order.tracking_number && order.status === 'shipped' && (
              <p className="text-xs text-gray-500">The customer is notified once, when the tracking number is first saved.</p>
            )}
            {order.tracking_number && (
              <p className="text-xs text-gray-400">
                Saved:{' '}
                <span className="font-mono text-gray-600">{order.tracking_number}</span>
              </p>
            )}
          </>
        )}
      </div>
      {order.order_items.some(i => i.creator_id) && order.status !== 'pending' && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Creator pickup (private)</p>
          {linePickups.map(p => (
            <div key={p.creator_id} className="text-xs leading-relaxed text-gray-700">
              <p className="font-medium">{p.display_name ?? 'Creator'} — {p.pickup_name}, {p.phone}</p>
              <p className="whitespace-pre-wrap">{p.address} - {p.pincode}</p>
              {p.shiprocket_location && <p>Shiprocket pickup location: <span className="font-mono">{p.shiprocket_location}</span></p>}
            </div>
          ))}
          {missingPickup && <p className="text-xs text-amber-700">A creator on this order has no pickup address. Add it under Creators.</p>}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600" htmlFor={`courier-${order.id}`}>Actual courier cost (₹)</label>
            <input id={`courier-${order.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={courierInput} onChange={e => setCourierInput(e.target.value)} placeholder="Not entered" className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1" />
            <button onClick={handleSaveCourier} disabled={savingCourier} className="text-sm px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50">{savingCourier ? 'Saving…' : 'Save'}</button>
          </div>
          {order.courier_cost_paise == null && <p className="text-xs text-gray-500">Creator payouts for this order show as pending courier cost until this is entered.</p>}
        </div>
      )}
      <OrderCases orderId={order.id} orderTotal={order.total_amount} initialCases={cases} initiallyUnavailable={casesUnavailable} />
    </div>
  )
}

// ─── main export ─────────────────────────────────────────────────────────────

export function OrdersClient({ initialOrders, initialCases = [], casesUnavailable = false, pickups = [] }: { initialOrders: OrderWithItems[]; initialCases?: OrderCase[]; casesUnavailable?: boolean; pickups?: CreatorPickup[] }) {
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders)

  function handleUpdate(updated: OrderWithItems) {
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)))
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">PostDuty — Orders</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {orders.length} order{orders.length !== 1 ? 's' : ''} total
        </p>
      </div>

      <StatsBar orders={orders} />
      <p className="text-xs text-gray-500 mb-5">All loaded orders. Recorded order value includes test and historical records; it is not verified revenue. Use <a className="underline" href="/admin/analytics">Business insights</a> for date-filtered, payment-evidenced metrics.</p>

      {orders.length === 0 ? (
        <p className="text-center text-gray-300 py-16 text-sm">No orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <OrderCard key={order.id} order={order} onUpdate={handleUpdate} cases={initialCases.filter(record => record.order_id === order.id)} casesUnavailable={casesUnavailable} pickups={pickups} />
          ))}
        </div>
      )}
    </div>
  )
}
