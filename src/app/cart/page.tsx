"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";

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

export default function CartPage() {
  const router = useRouter();
  const { cart, updateQuantity, removeFromCart, totalAmount, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Create Razorpay order on our server
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json() as { error?: string };
        throw new Error(err.error ?? "Payment system error");
      }

      const { razorpayOrderId, amount, keyId } = await orderRes.json() as {
        razorpayOrderId: string;
        amount: number;
        keyId: string;
      };

      // 2. Load Razorpay script
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Payment gateway failed to load. Please try again.");

      // 3. Open Razorpay modal
      const rzp = new (window as any).Razorpay({
        key: keyId,
        amount,
        currency: "INR",
        name: "PostDuty",
        description: "PostDuty Cart Checkout",
        order_id: razorpayOrderId,
        prefill: {
          name: form.name,
          email: form.email,
          contact: form.phone,
        },
        theme: { color: "#0D7C7C" },
        handler: async (response: any) => {
          // 4. Verify payment and create order
          const verifyRes = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              items: cart.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                unitPrice: item.product.price,
              })),
              customerName: form.name,
              customerEmail: form.email,
              customerPhone: form.phone,
              shippingAddress: form.address,
              totalAmount: totalAmount,
            }),
          });

          if (!verifyRes.ok) {
            setError("Payment received but verification failed. Please contact support with your payment ID: " + response.razorpay_payment_id);
            setLoading(false);
            return;
          }

          const { orderId } = await verifyRes.json() as { orderId: string };

          // Save order to history
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

          clearCart();
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

  if (cart.length === 0) {
    return (
      <main className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-light mb-6">
          <svg
            className="w-8 h-8 text-brand"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-stone-900">Your cart is empty</h1>
        <p className="mt-3 text-stone-500 text-sm max-w-xs mx-auto leading-relaxed">
          Looks like you haven&apos;t added anything to your cart yet. Find the perfect gift for your healthcare hero.
        </p>
        <Link href="/" className="btn-premium mt-8">
          Explore Gifts
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold text-stone-900 mb-8">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Cart items list */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => (
            <div
              key={item.product.id}
              className="flex items-center gap-4 bg-white border border-warm-border rounded-2xl p-4 shadow-sm"
            >
              <div className="w-20 h-20 bg-brand-light rounded-xl overflow-hidden flex-shrink-0">
                {item.product.image_url ? (
                  <img
                    src={item.product.image_url}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-brand opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-stone-800 text-sm leading-snug truncate">
                  {item.product.name}
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  Unit Price: {formatPrice(item.product.price)}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden h-8">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="px-2 bg-stone-50 hover:bg-stone-100 text-stone-600 transition-colors h-full text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="px-3 text-xs font-bold text-stone-800 bg-white flex items-center h-full min-w-8 justify-center select-none">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="px-2 bg-stone-50 hover:bg-stone-100 text-stone-600 transition-colors h-full text-xs font-bold"
                      disabled={item.quantity >= item.product.stock}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="text-right pl-2">
                <p className="font-bold text-brand text-sm">
                  {formatPrice(item.product.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}

          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-brand transition-colors pt-2"
          >
            ← Add more items
          </Link>
        </div>

        {/* Checkout details form */}
        <div className="bg-white border border-warm-border rounded-2xl p-6 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-stone-800 border-b border-warm-border pb-3 mb-4">
            Delivery &amp; Checkout
          </h2>

          <form onSubmit={handleCheckout} className="space-y-4">
            <div>
              <label htmlFor="checkout-name" className="block text-xs font-semibold text-stone-500 uppercase mb-1">
                Full Name
              </label>
              <input
                id="checkout-name"
                name="name"
                required
                placeholder="Full name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            
            <div>
              <label htmlFor="checkout-email" className="block text-xs font-semibold text-stone-500 uppercase mb-1">
                Email Address
              </label>
              <input
                id="checkout-email"
                name="email"
                type="email"
                required
                placeholder="Email address"
                value={form.email}
                onChange={handleChange}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div>
              <label htmlFor="checkout-phone" className="block text-xs font-semibold text-stone-500 uppercase mb-1">
                Phone Number
              </label>
              <input
                id="checkout-phone"
                name="phone"
                type="tel"
                required
                placeholder="Phone number"
                value={form.phone}
                onChange={handleChange}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div>
              <label htmlFor="checkout-address" className="block text-xs font-semibold text-stone-500 uppercase mb-1">
                Shipping Address
              </label>
              <textarea
                id="checkout-address"
                name="address"
                required
                placeholder="Full shipping address"
                value={form.address}
                onChange={handleChange}
                rows={3}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>

            <div className="border-t border-warm-border pt-4 mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Shipping</span>
                <span>Free Shipping</span>
              </div>
              <div className="flex items-center justify-between font-bold text-stone-800 text-base">
                <span>Total Amount</span>
                <span className="text-brand">{formatPrice(totalAmount)}</span>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-xs leading-relaxed text-center mt-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-premium w-full justify-center disabled:opacity-60 mt-4"
            >
              {loading ? "Opening payment..." : `Pay ${formatPrice(totalAmount)}`}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
