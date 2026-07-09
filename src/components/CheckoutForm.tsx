"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { useCart } from "@/components/CartContext";

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
  const { addToCart } = useCart();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
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
  const finalTotal = product.price + giftCharge - discountAmount;

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
          cartTotal: product.price + giftCharge,
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

  function handleAddToCart() {
    addToCart(product, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

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
        body: JSON.stringify({
          productId: product.id,
          quantity: 1,
          couponCode: couponApplied?.code || undefined,
          isGift,
          giftMessage: isGift ? giftMessage : undefined,
        }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json() as { error?: string };
        throw new Error(err.error ?? "Payment system error");
      }

      const { razorpayOrderId, amount, keyId } = await orderRes.json() as { razorpayOrderId: string; amount: number; keyId: string };

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
        theme: { color: "#0D7C7C" },
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

          // Save order to local storage history
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
        className="mt-8 w-full bg-stone-300 text-stone-500 py-3 rounded-xl font-semibold text-sm cursor-not-allowed"
      >
        Out of stock
      </button>
    );
  }

  if (!open) {
    return (
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setOpen(true)}
          className="btn-premium flex-1 justify-center"
        >
          Buy Now
        </button>
        <button
          onClick={handleAddToCart}
          className={`btn-ghost flex-1 justify-center ${
            added ? "bg-emerald-50 border-emerald-200 text-emerald-700" : ""
          }`}
        >
          {added ? "✓ Added!" : "Add to Cart"}
        </button>
      </div>
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
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="Email address"
        value={form.email}
        onChange={handleChange}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
      />
      <input
        name="phone"
        type="tel"
        required
        placeholder="Phone number"
        value={form.phone}
        onChange={handleChange}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
      />
      <textarea
        name="address"
        required
        placeholder="Full shipping address"
        value={form.address}
        onChange={handleChange}
        rows={3}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand resize-none"
      />

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
      <div className="border-t border-warm-border pt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>Item price</span>
          <span>{formatPrice(product.price)}</span>
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
        <div className="flex items-center justify-between font-bold text-stone-800 text-sm pt-1">
          <span>Total</span>
          <span className="text-brand">{formatPrice(finalTotal)}</span>
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-xs leading-relaxed">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-premium w-full justify-center disabled:opacity-60"
      >
        {loading ? "Opening payment..." : `Pay ${formatPrice(finalTotal)}`}
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
