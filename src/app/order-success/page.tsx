"use client";

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  useEffect(() => {
    if (!orderId) return;
    try {
      const history = localStorage.getItem("postduty_orders");
      const ordersList = history ? JSON.parse(history) : [];
      if (!ordersList.includes(orderId)) {
        ordersList.push(orderId);
        localStorage.setItem("postduty_orders", JSON.stringify(ordersList));
      }
    } catch (e) {
      console.error("Failed to save order to history:", e);
    }
  }, [orderId]);

  return (
    <main className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 mb-6">
        <svg
          className="w-8 h-8 text-emerald-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-extrabold text-stone-900">
        Payment successful!
      </h1>
      <p className="mt-3 text-stone-500 text-sm leading-relaxed max-w-xs mx-auto">
        Thank you for your order. We&apos;ll pack it with care and ship it to you
        shortly.
      </p>

      {orderId && (
        <div className="mt-6 space-y-4">
          <p className="text-xs text-stone-400">
            Order reference:{" "}
            <span className="font-mono text-stone-600 select-all">{orderId}</span>
          </p>

          <Link href={`/orders/${orderId}`} className="btn-premium">
            Track Order Status →
          </Link>
        </div>
      )}

      <div className="pt-8">
        <Link
          href="/"
          className="text-xs font-semibold text-stone-400 hover:text-stone-600 hover:underline"
        >
          Back to shop
        </Link>
      </div>
    </main>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-20 text-center text-sm text-stone-400">Loading order details...</div>}>
      <OrderSuccessContent />
    </Suspense>
  );
}
