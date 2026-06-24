"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

// Minimal type declaration so TypeScript knows about the Razorpay browser object
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function CheckoutForm({ product }: { product: Product }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Create Razorpay order on our server
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json();
        throw new Error(err.error || "Could not initiate payment");
      }

      const { razorpayOrderId, amount, keyId } = await orderRes.json();

      // 2. Load Razorpay checkout script
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Payment gateway failed to load. Please try again.");

      // 3. Open Razorpay payment modal
      const rzp = new window.Razorpay({
        key: keyId,
        amount,
        currency: "INR",
        name: "PostDuty",
        description: product.name,
        order_id: razorpayOrderId,
        prefill: {
          name: form.name,
          email: form.email,
          contact: form.phone,
        },
        theme: { color: "#000000" },
        handler: async (response) => {
          // 4. Verify payment on our server and save order
          const verifyRes = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              productId: product.id,
              quantity: 1,
              unitPrice: product.price,
              customerName: form.name,
              customerEmail: form.email,
              customerPhone: form.phone,
              shippingAddress: form.address,
              totalAmount: product.price,
            }),
          });

          if (!verifyRes.ok) {
            setError("Payment received but verification failed. Please contact support with your payment ID: " + response.razorpay_payment_id);
            setLoading(false);
            return;
          }

          const { orderId } = await verifyRes.json();
          router.push(`/order-success?orderId=${orderId}`);
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });

      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (product.stock === 0) {
    return (
      <button
        disabled
        className="mt-8 w-full bg-black text-white py-3 rounded-lg font-semibold text-sm opacity-40 cursor-not-allowed"
      >
        Out of stock
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-8 w-full bg-black text-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors"
      >
        Buy Now
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <input
        name="name"
        required
        placeholder="Full name"
        value={form.name}
        onChange={handleChange}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="Email address"
        value={form.email}
        onChange={handleChange}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
      <input
        name="phone"
        type="tel"
        required
        placeholder="Phone number"
        value={form.phone}
        onChange={handleChange}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
      <textarea
        name="address"
        required
        placeholder="Full shipping address"
        value={form.address}
        onChange={handleChange}
        rows={3}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black resize-none"
      />

      {error && (
        <p className="text-red-500 text-xs leading-relaxed">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-60 hover:bg-gray-800 transition-colors"
      >
        {loading ? "Opening payment..." : `Pay ${formatPrice(product.price)}`}
      </button>

      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="w-full text-sm text-gray-400 hover:text-gray-600 hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}
