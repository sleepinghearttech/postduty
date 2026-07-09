'use client'

import { useState } from 'react'
import { Order, OrderWithItems, OrderStatus } from '@/lib/types'

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
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'Pending',
  paid:      'Paid — ready to ship',
  shipped:   'Shipped',
  delivered: 'Delivered ✓',
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
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
      <StatCard label="Total revenue" value={formatRupees(totalRevenuePaise)} />
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
}: {
  order: OrderWithItems
  onUpdate: (updated: OrderWithItems) => void
}) {
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [trackingInput, setTrackingInput] = useState(order.tracking_number ?? '')
  const [savingTracking, setSavingTracking] = useState(false)

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  async function handleStatusChange(newStatus: OrderStatus) {
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

  const items = order.order_items.map(
    i => `${i.products?.name ?? 'Unknown product'} × ${i.quantity}`
  )

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
            <p key={i} className="text-gray-700">
              {item}
            </p>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Total
          </p>
          <p className="text-lg font-bold text-gray-900">{formatRupees(order.total_amount)}</p>
          {order.discount_amount > 0 && (
            <p className="text-xs text-green-600 mt-0.5">Discount: -{formatRupees(order.discount_amount)}</p>
          )}
          {order.is_gift && order.gift_message && (
            <p className="text-xs text-amber-600 mt-1 italic">"{ order.gift_message}"</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {order.status === 'pending' && (
            <button
              onClick={() => handleStatusChange('paid')}
              disabled={saving}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Mark as paid'}
            </button>
          )}
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
            <span className="text-xs text-emerald-600 italic">Delivered — follow-up messages will be sent automatically</span>
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
            {order.tracking_number && (
              <p className="text-xs text-gray-400">
                Saved:{' '}
                <span className="font-mono text-gray-600">{order.tracking_number}</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── main export ─────────────────────────────────────────────────────────────

export function OrdersClient({ initialOrders }: { initialOrders: OrderWithItems[] }) {
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

      {orders.length === 0 ? (
        <p className="text-center text-gray-300 py-16 text-sm">No orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <OrderCard key={order.id} order={order} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
