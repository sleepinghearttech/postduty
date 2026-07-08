"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function OrdersPage() {
  const router = useRouter();
  const [recentOrders, setRecentOrders] = useState<string[]>([]);
  const [form, setForm] = useState({
    orderId: "",
    verification: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const history = localStorage.getItem("postduty_orders");
      if (history) {
        setRecentOrders(JSON.parse(history));
      }
    } catch (e) {
      console.error("Failed to load order history:", e);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!form.orderId || !form.verification) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: form.orderId.trim(),
          verification: form.verification.trim(),
        }),
      });

      if (!res.ok) {
        setError("Order not found or verification failed.");
        setLoading(false);
        return;
      }

      // Successful verification, redirect to details page
      router.push(`/orders/${form.orderId.trim()}`);
    } catch (err) {
      setError("An error occurred during lookup.");
      setLoading(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold text-stone-900 mb-2">Track Order</h1>
      <p className="text-sm text-stone-500 mb-8 leading-relaxed">
        Verify your order details to track shipment status and view delivery timelines.
      </p>

      {/* Lookup Form */}
      <div className="bg-white border border-warm-border rounded-2xl p-6 shadow-sm mb-8">
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <label htmlFor="lookup-order-id" className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Order ID / Reference
            </label>
            <input
              id="lookup-order-id"
              name="orderId"
              required
              placeholder="e.g. 5968a168-7e4e-4998-a2ae-..."
              value={form.orderId}
              onChange={handleChange}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand font-mono"
            />
          </div>

          <div>
            <label htmlFor="lookup-verification" className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Verification (Email or Phone)
            </label>
            <input
              id="lookup-verification"
              name="verification"
              required
              placeholder="Email or phone used during checkout"
              value={form.verification}
              onChange={handleChange}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs leading-relaxed mt-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-premium w-full justify-center"
          >
            {loading ? "Searching..." : "Track Status"}
          </button>
        </form>
      </div>

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div className="border-t border-warm-border pt-6">
          <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">
            Recent Orders on this Browser
          </h2>
          <div className="space-y-2">
            {recentOrders.map((orderId) => (
              <Link
                key={orderId}
                href={`/orders/${orderId}`}
                className="flex items-center justify-between p-3.5 bg-stone-50 hover:bg-stone-100 border border-warm-border rounded-xl transition-all cursor-pointer"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-xs font-mono font-bold text-stone-800 truncate">
                    #{orderId.slice(0, 8).toUpperCase()}...
                  </p>
                  <p className="text-[10px] text-stone-400 mt-0.5">Click to track delivery</p>
                </div>
                <span className="text-stone-400 hover:text-brand text-xs font-bold">Track →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
