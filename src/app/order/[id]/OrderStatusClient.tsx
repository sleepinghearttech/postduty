"use client";

import { useState } from "react";

import type { CustomerOrderTracking as OrderResult } from "@/lib/order-tracking";

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Payment pending",
  paid: "Payment recorded — check fulfillment updates below",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const FULFILLMENT_LABELS: Record<string, string> = {
  awaiting_acceptance: "Awaiting fulfillment", assigned: "Awaiting fulfillment",
  accepted: "Accepted for preparation", preparing: "In preparation",
  ready: "Ready to dispatch", dispatched: "Dispatched", shipped: "Shipped", delivered: "Delivered",
};

export default function OrderStatusClient({ orderId }: { orderId: string }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);

    try {
      const res = await fetch("/api/order-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, phone }),
      });

      const data = (await res.json()) as OrderResult & { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Order not found.");
        return;
      }

      setOrder(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (order) {
    return (
      <div className="border border-warm-border rounded-xl p-5">
        <p className="text-xs text-stone-400 mb-1">
          Order placed {new Date(order.createdAt).toLocaleDateString("en-IN")}
        </p>
        <p className="text-lg font-bold text-brand mb-4">
          {STATUS_LABELS[order.status] ?? order.status}
        </p>

        {order.testMode && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">Test order · These are fictional fulfillment updates. No real shipment is expected.</p>}

        <h2 className="text-sm font-semibold text-stone-800 mb-3">Items &amp; fulfillment</h2>
        {order.items.length > 1 && <p className="text-xs leading-relaxed text-stone-500 mb-3">Items may be prepared and dispatched separately. Each update below applies to that item.</p>}
        <ul className="space-y-3 mb-5">
          {order.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-warm-border bg-white p-3 text-sm">
              <p className="font-semibold text-stone-800">{item.name}</p>
              {item.creatorName && <p className="text-xs text-stone-500 mt-1">Fulfilled by {item.creatorName}</p>}
              <p className="text-xs text-stone-500 mt-1">Quantity {item.quantity} · {formatPrice(item.unitPrice * item.quantity)}</p>
              <p className="text-xs font-semibold text-brand mt-3">{FULFILLMENT_LABELS[item.fulfillmentStatus ?? ''] ?? 'Item-level fulfillment update not available'}</p>
              {item.courier && <p className="text-xs text-stone-600 mt-2">Courier: {item.courier}</p>}
              {item.trackingNumber && <p className="text-xs text-stone-600 mt-2">Tracking: <span className="font-mono break-all">{item.trackingNumber}</span></p>}
              {item.trackingUrl && <a href={item.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-brand underline underline-offset-4 min-h-11 mt-1">Open courier tracking ↗</a>}
              {item.fulfillmentStatus === 'dispatched' && !item.trackingNumber && !item.trackingUrl && <p className="text-xs text-stone-500 mt-2">Tracking details have not been added for this item.</p>}
            </li>
          ))}
        </ul>

        <p className="text-sm font-semibold text-stone-800 mb-3">Order total: {formatPrice(order.totalAmount)}</p>
        {order.trackingNumber && <div className="border-t border-warm-border pt-3 mt-4"><p className="text-xs text-stone-500 mb-1">Order-level tracking</p><p className="text-sm font-mono text-stone-700 break-all">{order.trackingNumber}</p></div>}
        {!order.trackingNumber && !order.items.some(item => item.trackingNumber || item.trackingUrl) && <p className="text-xs text-stone-500">Tracking details will appear here when recorded.</p>}

      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="tel"
        autoComplete="tel"
        aria-label="Phone number used at checkout"
        required
        placeholder="Phone number used at checkout"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
      />

      {error && <p className="text-red-500 text-xs leading-relaxed">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 hover:bg-accent-dark transition-colors shadow-sm"
      >
        {loading ? "Checking..." : "Check status"}
      </button>
    </form>
  );
}
