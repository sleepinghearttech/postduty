"use client";

import React, { useEffect, useState } from "react";
import type { Coupon } from "@/lib/types";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    discount_type: "percent" as "percent" | "flat",
    discount_value: "",
    min_order: "",
    max_uses: "",
    expires_at: "",
    referrer_code: "",
  });

  async function fetchCoupons() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coupons");
      if (!res.ok) throw new Error("Failed to load coupons");
      const data = await res.json() as { coupons: Coupon[] };
      setCoupons(data.coupons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCoupons();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          discount_value:
            form.discount_type === "flat"
              ? Math.round(parseFloat(form.discount_value) * 100) // ₹ to paise
              : parseInt(form.discount_value), // percent stays as-is
          min_order: form.min_order
            ? Math.round(parseFloat(form.min_order) * 100)
            : 0,
          max_uses: form.max_uses ? parseInt(form.max_uses) : null,
          expires_at: form.expires_at || null,
          referrer_code: form.referrer_code || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error);
      }

      setSuccess("Coupon created!");
      setForm({
        code: "",
        discount_type: "percent",
        discount_value: "",
        min_order: "",
        max_uses: "",
        expires_at: "",
        referrer_code: "",
      });
      fetchCoupons();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create coupon");
    }
    setCreating(false);
  }

  async function toggleActive(coupon: Coupon) {
    try {
      await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
      });
      fetchCoupons();
    } catch {
      setError("Failed to update coupon");
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold text-stone-900 mb-6">
        Coupon Management
      </h1>

      {/* Create form */}
      <div className="bg-white border border-warm-border rounded-2xl p-6 mb-8 shadow-sm">
        <h2 className="text-lg font-bold text-stone-800 mb-4">
          Create New Coupon
        </h2>
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Code
            </label>
            <input
              required
              placeholder="e.g. WELCOME10"
              value={form.code}
              onChange={(e) =>
                setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Type
            </label>
            <select
              value={form.discount_type}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  discount_type: e.target.value as "percent" | "flat",
                }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="percent">Percentage (%)</option>
              <option value="flat">Flat Amount (₹)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              {form.discount_type === "percent"
                ? "Discount (%)"
                : "Discount (₹)"}
            </label>
            <input
              required
              type="number"
              min="1"
              placeholder={
                form.discount_type === "percent" ? "e.g. 10" : "e.g. 50"
              }
              value={form.discount_value}
              onChange={(e) =>
                setForm((p) => ({ ...p, discount_value: e.target.value }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Min. Order (₹, optional)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 399"
              value={form.min_order}
              onChange={(e) =>
                setForm((p) => ({ ...p, min_order: e.target.value }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Max Uses (optional)
            </label>
            <input
              type="number"
              min="1"
              placeholder="Leave blank for unlimited"
              value={form.max_uses}
              onChange={(e) =>
                setForm((p) => ({ ...p, max_uses: e.target.value }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Expiry Date (optional)
            </label>
            <input
              type="date"
              value={form.expires_at}
              onChange={(e) =>
                setForm((p) => ({ ...p, expires_at: e.target.value }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
              Referrer Code (optional, for ambassadors)
            </label>
            <input
              placeholder="e.g. dr-anil"
              value={form.referrer_code}
              onChange={(e) =>
                setForm((p) => ({ ...p, referrer_code: e.target.value.toLowerCase() }))
              }
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-4 mt-2">
            <button
              type="submit"
              disabled={creating}
              className="btn-premium disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Coupon"}
            </button>
            {error && (
              <p className="text-red-500 text-xs font-medium">{error}</p>
            )}
            {success && (
              <p className="text-green-600 text-xs font-medium">{success}</p>
            )}
          </div>
        </form>
      </div>

      {/* Coupons list */}
      <h2 className="text-lg font-bold text-stone-800 mb-4">
        All Coupons
      </h2>

      {loading ? (
        <p className="text-sm text-stone-400">Loading...</p>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-stone-400">
          No coupons yet. Create one above.
        </p>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon) => {
            const isExpired =
              coupon.expires_at && new Date(coupon.expires_at) < new Date();
            const isMaxed =
              coupon.max_uses !== null &&
              coupon.times_used >= coupon.max_uses;

            return (
              <div
                key={coupon.id}
                className={`bg-white border rounded-2xl p-5 shadow-sm transition-all ${
                  coupon.is_active && !isExpired && !isMaxed
                    ? "border-green-200"
                    : "border-stone-200 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <span className="font-mono font-bold text-lg text-brand tracking-wider">
                      {coupon.code}
                    </span>
                    {coupon.referrer_code && (
                      <span className="ml-2 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                        Ambassador: {coupon.referrer_code}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isExpired && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                        Expired
                      </span>
                    )}
                    {isMaxed && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                        Maxed Out
                      </span>
                    )}
                    <button
                      onClick={() => toggleActive(coupon)}
                      className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                        coupon.is_active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                      }`}
                    >
                      {coupon.is_active ? "Active" : "Inactive"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-stone-500">
                  <div>
                    <span className="font-semibold text-stone-700">
                      Discount:{" "}
                    </span>
                    {coupon.discount_type === "percent"
                      ? `${coupon.discount_value}%`
                      : formatPaise(coupon.discount_value)}
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700">
                      Min Order:{" "}
                    </span>
                    {coupon.min_order > 0
                      ? formatPaise(coupon.min_order)
                      : "None"}
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700">
                      Uses:{" "}
                    </span>
                    {coupon.times_used}
                    {coupon.max_uses !== null ? ` / ${coupon.max_uses}` : " / ∞"}
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700">
                      Expires:{" "}
                    </span>
                    {coupon.expires_at
                      ? new Date(coupon.expires_at).toLocaleDateString("en-IN")
                      : "Never"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
