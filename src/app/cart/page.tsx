"use client";

import React, { useState, useEffect } from "react";
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

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{
    code: string;
    discountAmount: number;
    message: string;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Gift state
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");

  // Auto-apply referral code from localStorage
  useEffect(() => {
    try {
      const refCode = localStorage.getItem("postduty_referral_code");
      if (refCode && !couponApplied) {
        setCouponCode(refCode);
      }
    } catch { /* ignore */ }
  }, [couponApplied]);

  const giftCharge = isGift ? 2000 : 0; // ₹20 in paise
  const discountAmount = couponApplied?.discountAmount ?? 0;
  const finalTotal = totalAmount + giftCharge - discountAmount;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    setCouponApplied(null);

    try {
      const res = await fetch("/api/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim(),
          cartTotal: totalAmount + giftCharge,
        }),
      });

      const data = await res.json() as {
        valid: boolean;
        discountAmount?: number;
        message: string;
      };

      if (data.valid && data.discountAmount) {
        setCouponApplied({
          code: couponCode.trim().toUpperCase(),
          discountAmount: data.discountAmount,
          message: data.message,
        });
        setCouponError(null);
      } else {
        setCouponError(data.message);
      }
    } catch {
      setCouponError("Failed to validate coupon. Please try again.");
    }
    setCouponLoading(false);
  }

  function removeCoupon() {
    setCouponApplied(null);
    setCouponCode("");
    setCouponError(null);
    try { localStorage.removeItem("postduty_referral_code"); } catch { /* ignore */ }
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
          couponCode: couponApplied?.code || undefined,
          isGift,
          giftMessage: isGift ? giftMessage : undefined,
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
              totalAmount: amount,
              couponCode: couponApplied?.code || undefined,
              discountAmount: couponApplied?.discountAmount ?? 0,
              isGift,
              giftMessage: isGift ? giftMessage : undefined,
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
            // Clear referral code after successful purchase
            localStorage.removeItem("postduty_referral_code");
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
      <main className="reveal-up max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-brand-light to-gold-soft mb-6">
          {/* Gift box with bow — fits the "gifts for healthcare heroes" positioning */}
          <svg
            className="w-10 h-10 text-brand"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="3.5" y="9.5" width="17" height="10.5" rx="1" strokeWidth={1.4} />
            <path d="M3.5 13h17" strokeWidth={1.4} />
            <path d="M12 9.5v10.5" strokeWidth={1.4} />
            <path
              d="M12 9.5c-1-3-3-4.2-4.5-3.4C6 6.8 6.5 9 8.5 9.3c1.2.2 2.6.2 3.5.2zM12 9.5c1-3 3-4.2 4.5-3.4C18 6.8 17.5 9 15.5 9.3c-1.2.2-2.6.2-3.5.2z"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="font-serif text-2xl text-ink-900">Your cart is empty</h1>
        <p className="mt-3 text-ink-400 text-sm max-w-xs mx-auto leading-relaxed">
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

            {/* Gift Option */}
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => {
                    setIsGift(e.target.checked);
                    // Re-validate coupon if gift status changes minimum order
                    if (couponApplied) {
                      setCouponApplied(null);
                      setCouponCode(couponApplied.code);
                    }
                  }}
                  className="w-4 h-4 accent-amber-600 rounded"
                />
                <span className="text-sm font-semibold text-stone-700">
                  🎁 Is this a gift? Add a printed greeting card <span className="text-amber-700">(+₹20)</span>
                </span>
              </label>
              {isGift && (
                <textarea
                  placeholder="Your gift message (optional) — we'll print it on a card and include it in the package"
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                  rows={2}
                  maxLength={200}
                  className="mt-3 w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white"
                />
              )}
            </div>

            {/* Coupon Code */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">
                Coupon Code
              </label>
              {couponApplied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-mono font-bold text-green-700 text-sm">{couponApplied.code}</span>
                    <span className="text-xs text-green-600 ml-2">{couponApplied.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    placeholder="Enter code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-colors"
                  >
                    {couponLoading ? "..." : "Apply"}
                  </button>
                </div>
              )}
              {couponError && (
                <p className="text-red-500 text-xs mt-1">{couponError}</p>
              )}
            </div>

            {/* Order Summary */}
            <div className="border-t border-warm-border pt-4 mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Subtotal</span>
                <span>{formatPrice(totalAmount)}</span>
              </div>
              {isGift && (
                <div className="flex items-center justify-between text-xs text-amber-600">
                  <span>🎁 Gift Card</span>
                  <span>+{formatPrice(giftCharge)}</span>
                </div>
              )}
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-green-600">
                  <span>Coupon Discount</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Shipping</span>
                <span>Free Shipping</span>
              </div>
              <div className="flex items-center justify-between font-bold text-stone-800 text-base">
                <span>Total Amount</span>
                <span className="text-brand">{formatPrice(finalTotal)}</span>
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
              {loading ? "Opening payment..." : `Pay ${formatPrice(finalTotal)}`}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
