"use client";

import { useState } from "react";

type OrderResult = {
  status: string;
  trackingNumber: string | null;
  totalAmount: number;
  createdAt: string;
  items: { name: string; quantity: number; unitPrice: number }[];
};

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Payment pending",
  paid: "Confirmed — being prepared for shipping",
  shipped: "Shipped",
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

        <ul className="space-y-1 text-sm text-stone-600 mb-4">
          {order.items.map((item, i) => (
            <li key={i}>
              {item.name} × {item.quantity} — {formatPrice(item.unitPrice * item.quantity)}
            </li>
          ))}
        </ul>

        <p className="text-sm font-semibold text-stone-800 mb-3">
          Total: {formatPrice(order.totalAmount)}
        </p>

        {order.trackingNumber ? (
          <p className="text-sm text-stone-600">
            Tracking number: <span className="font-mono">{order.trackingNumber}</span>
          </p>
        ) : (
          <p className="text-xs text-stone-400">Tracking number not added yet.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="tel"
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
