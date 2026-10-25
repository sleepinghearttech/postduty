"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart, cartUnitPrice, cartStock } from "@/components/CartContext";
import type { Storefront } from "@/components/commerce/types";
import { packPricing } from "@/lib/pack-pricing";
import { storedAttribution, trackEvent } from "@/lib/attribution-client";

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
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

type PaymentResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
export type CartConfig = { states: { code: string; name: string }[]; allStatesServed: boolean; pinPrefixes?: string[] | null; deliveryAreaLabel?: string | null; sameDayPrefixes?: string[] | null; sameDayShipping?: number; servedPrefixes?: string[] | null; servedLabel?: string; statePinPrefixes?: Record<string, readonly string[]>; singleItemShipping: number; gstRegistered: boolean };

const inputClass = "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand";
const labelClass = "block text-xs font-semibold text-stone-500 uppercase mb-1";

export default function CartClient({ states, allStatesServed, pinPrefixes = null, deliveryAreaLabel = null, sameDayPrefixes = null, sameDayShipping = 9900, servedPrefixes = null, servedLabel = "our delivery area", statePinPrefixes = {}, singleItemShipping, gstRegistered }: CartConfig) {
  const router = useRouter();
  const { cart: allItems, updateQuantity, removeFromCart, clearCart } = useCart();
  const searchParams = useSearchParams();
  const storefront: Storefront = searchParams.get("storefront") === "christmas" ? "christmas" : "general";
  const cart = allItems.filter(item => item.storefront === storefront);
  const totalAmount = cart.reduce((sum,item) => sum + cartUnitPrice(item) * item.quantity, 0);
  // Mirrors the server's pack rule (any 4 clips for one pack price); the server recalculates before payment.
  const pack = packPricing(cart.map(item => ({ unitPrice: cartUnitPrice(item), quantity: item.quantity, pack: item.product.commerce?.pack })));
  const packRule = cart.map(item => item.product.commerce?.pack).find(Boolean) ?? null;
  const packUnits = packRule ? cart.filter(item => item.product.commerce?.pack?.group === packRule.group).reduce((sum,item) => sum + item.quantity, 0) : 0;
  const [deliveryMethod, setDeliveryMethod] = useState<"standard" | "same_day">("standard");
  const sameDayOffered = Boolean(sameDayPrefixes?.length);
  const browseHref = storefront === "christmas" ? "/christmas" : "/store";
  const [loading, setLoading] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<string | null>(null);
  const [verificationResponse, setVerificationResponse] = useState<PaymentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateCode: "",
    pincode: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const sameDayPinOk = !form.pincode || /^\d{6}$/.test(form.pincode) === false || Boolean(sameDayPrefixes?.some(p => form.pincode.startsWith(p)));
  const effectiveDelivery = deliveryMethod === "same_day" && !sameDayPinOk ? "standard" : deliveryMethod;
  // Live serviceability: a complete PIN outside the served area (or outside the chosen state) blocks payment before it starts.
  const pinComplete = /^[1-9]\d{5}$/.test(form.pincode);
  const statePrefixes = form.stateCode ? statePinPrefixes?.[form.stateCode] ?? null : null;
  const pinServed = !pinComplete || !servedPrefixes || servedPrefixes.some(p => form.pincode.startsWith(p));
  const pinMatchesState = !pinComplete || !statePrefixes || statePrefixes.some(p => form.pincode.startsWith(p));
  const pinBlocked = pinComplete && (!pinServed || !pinMatchesState);
  // Mirrors the server rule; the server recalculates every amount before payment.
  const shippingCharge = effectiveDelivery === "same_day" ? sameDayShipping : pack.packs > 0 ? 0 : singleItemShipping;

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
    let cancelled = false;
    // Keep the server and first client render identical; cancel stale hydration.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const refCode = localStorage.getItem("postduty_referral_code");
        if (refCode && !couponApplied) {
          setCouponCode(refCode);
        }
      } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [couponApplied]);

  useEffect(() => { queueMicrotask(() => setCouponApplied(null)); }, [totalAmount]);

  useEffect(() => { queueMicrotask(() => { try { setPendingPayment(localStorage.getItem(`postduty_pending_payment_${storefront}`)); } catch {} }); }, [storefront]);

  const giftCharge = isGift ? 2000 : 0; // ₹20 in paise
  const discountAmount = couponApplied?.discountAmount ?? 0;
  const finalTotal = totalAmount + giftCharge + shippingCharge - pack.saving - discountAmount;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
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
          subtotal: totalAmount - pack.saving,
          giftCharge,
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

  async function verifyPayment(response: PaymentResponse) {
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        }),
      });
      const result = await verifyRes.json() as { orderId?: string; error?: string };
      if (!verifyRes.ok || !result.orderId) throw new Error(result.error || "Payment confirmation is pending.");
      try {
        const saved = JSON.parse(localStorage.getItem("postduty_orders") || "[]");
        const orders = Array.isArray(saved) ? saved : [];
        if (!orders.includes(result.orderId)) orders.push(result.orderId);
        localStorage.setItem("postduty_orders", JSON.stringify(orders));
        localStorage.removeItem("postduty_referral_code");
        localStorage.removeItem(`postduty_pending_payment_${storefront}`);
      } catch {}
      setPendingPayment(null);
      clearCart(storefront);
      router.push(`/order-success?orderId=${encodeURIComponent(result.orderId)}&storefront=${storefront}`);
    } catch (err) {
      setError((err instanceof Error ? err.message : "Payment confirmation could not be completed.") + " Keep your payment reference and contact support if confirmation remains pending.");
    } finally { setLoading(false); }
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0 || pendingPayment) return;
    setLoading(true);
    setError(null);

    trackEvent("checkout_start", { storefront });
    try {
      // 1. Create Razorpay order on our server
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            variantId: item.variantId,
            personalization: item.personalization,
          })),
          storefront,
          customerName: form.name, customerEmail: form.email, customerPhone: form.phone,
          addressLine1: form.addressLine1, addressLine2: form.addressLine2 || undefined, city: form.city, stateCode: form.stateCode, pincode: form.pincode,
          acceptTerms, deliveryMethod: effectiveDelivery,
          couponCode: couponApplied?.code || undefined,
          isGift,
          giftMessage: isGift ? giftMessage : undefined,
          attribution: storedAttribution(),
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
      const rzp = new window.Razorpay({
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
        handler: async (response) => {
          setVerificationResponse(response);
          setPendingPayment(response.razorpay_payment_id);
          try { localStorage.setItem(`postduty_pending_payment_${storefront}`, response.razorpay_payment_id); } catch {}
          await verifyPayment(response);
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
        <h1 className="font-serif text-2xl text-ink-900">Your {storefront === "christmas" ? "Christmas" : "PostDuty Store"} bag is empty</h1>
        {allItems.length > 0 && <Link href={`/cart?storefront=${storefront === "christmas" ? "general" : "christmas"}`} className="block mt-4 text-sm text-brand underline">Open your {storefront === "christmas" ? "PostDuty Store" : "Christmas"} bag →</Link>}
        <p className="mt-3 text-ink-400 text-sm max-w-xs mx-auto leading-relaxed">
          Looks like you haven&apos;t added anything to your cart yet. Explore the collection to find something that feels personal.
        </p>
        <Link href={browseHref} className="btn-premium mt-8">
          Explore Gifts
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold text-stone-900 mb-3">Your bag</h1>
      <div className="flex gap-3 text-xs mb-8"><Link className={storefront === "general" ? "font-bold underline" : "text-stone-500"} href="/cart?storefront=general">PostDuty Store ({allItems.filter(i=>i.storefront==='general').reduce((n,i)=>n+i.quantity,0)})</Link><Link className={storefront === "christmas" ? "font-bold underline" : "text-stone-500"} href="/cart?storefront=christmas">Christmas ({allItems.filter(i=>i.storefront==='christmas').reduce((n,i)=>n+i.quantity,0)})</Link></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Cart items list */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => (
            <div
              key={item.lineId}
              className="flex items-start gap-3 bg-white border border-warm-border rounded-2xl p-4 shadow-sm"
            >
              <div className="w-16 h-16 bg-brand-light rounded-xl overflow-hidden flex-shrink-0">
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
                <h3 className="font-bold text-stone-800 text-sm leading-snug">
                  <Link href={`/products/${item.product.slug}?storefront=${storefront}`}>{item.product.name}</Link>
                </h3>
                {item.variantId && <p className="text-xs text-stone-500 mt-1">{item.product.commerce?.variants?.find(v=>v.id===item.variantId)?.name}</p>}
                {item.personalization && <p className="text-xs text-stone-500 mt-1 break-words">Personalisation: {item.personalization}</p>}
                <p className="text-xs text-stone-400 mt-0.5">
                  Unit Price: {formatPrice(cartUnitPrice(item))}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden h-11">
                    <button
                      aria-label={`Decrease quantity of ${item.product.name}`}
                      onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                      className="px-3 bg-stone-50 hover:bg-stone-100 text-stone-600 transition-colors h-full text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="px-3 text-xs font-bold text-stone-800 bg-white flex items-center h-full min-w-8 justify-center select-none">
                      {item.quantity}
                    </span>
                    <button
                      aria-label={`Increase quantity of ${item.product.name}`}
                      onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                      className="px-3 bg-stone-50 hover:bg-stone-100 text-stone-600 transition-colors h-full text-xs font-bold"
                      disabled={item.quantity >= cartStock(item)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.lineId)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium min-h-11"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="text-right pl-1">
                <p className="font-bold text-brand text-sm">
                  {formatPrice(cartUnitPrice(item) * item.quantity)}
                </p>
              </div>
            </div>
          ))}

          <Link
            href={browseHref}
            className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-brand transition-colors pt-2"
          >
            ← Add more items
          </Link>
        </div>

        {/* Checkout details form */}
        <div className="bg-white border border-warm-border rounded-2xl p-5 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-stone-800 border-b border-warm-border pb-3 mb-4">
            Delivery &amp; Checkout
          </h2>

          <form onSubmit={handleCheckout} className="space-y-4">
            {pinPrefixes ? (
              <p className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs leading-relaxed text-stone-600">
                {pinPrefixes.length ? <>We currently deliver only within <strong>{deliveryAreaLabel ?? "selected areas"}</strong> (PIN codes starting with {pinPrefixes.join(", ")}).</> : "Delivery is temporarily unavailable."}
              </p>
            ) : !allStatesServed && (
              <p className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs leading-relaxed text-stone-600">
                {states.length ? <>We currently deliver to: <strong>{states.map(s => s.name).join(", ")}</strong>.</> : "Delivery is temporarily unavailable."}
              </p>
            )}
            <div>
              <label htmlFor="checkout-name" className={labelClass}>Full Name</label>
              <input id="checkout-name" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Recipient's full name" value={form.name} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label htmlFor="checkout-phone" className={labelClass}>Mobile Number</label>
              <input id="checkout-phone" name="phone" autoComplete="tel-national" type="tel" inputMode="numeric" required pattern="[+0-9 \-]{10,16}" title="10-digit Indian mobile number" placeholder="10-digit mobile number" value={form.phone} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label htmlFor="checkout-email" className={labelClass}>Email Address</label>
              <input id="checkout-email" name="email" autoComplete="email" type="email" required maxLength={254} placeholder="Email address" value={form.email} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label htmlFor="checkout-line1" className={labelClass}>Address Line 1</label>
              <input id="checkout-line1" name="addressLine1" autoComplete="address-line1" required minLength={3} maxLength={200} placeholder="House / flat number, building, street" value={form.addressLine1} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label htmlFor="checkout-line2" className={labelClass}>Address Line 2 <span className="normal-case font-normal">(optional)</span></label>
              <input id="checkout-line2" name="addressLine2" autoComplete="address-line2" maxLength={200} placeholder="Area, landmark" value={form.addressLine2} onChange={handleChange} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="checkout-city" className={labelClass}>City</label>
                <input id="checkout-city" name="city" autoComplete="address-level2" required minLength={2} maxLength={100} placeholder="City / town" value={form.city} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label htmlFor="checkout-pincode" className={labelClass}>PIN Code</label>
                <input id="checkout-pincode" name="pincode" autoComplete="postal-code" inputMode="numeric" required pattern="[1-9][0-9]{5}" maxLength={6} title="6-digit PIN code" placeholder="6 digits" value={form.pincode} onChange={handleChange} className={inputClass} aria-describedby="checkout-pincode-status" aria-invalid={pinBlocked || undefined} />
                <p id="checkout-pincode-status" role="status" aria-live="polite" className="mt-1 text-[11px] leading-snug">
                  {pinComplete && !pinServed && <span className="text-red-700">Sorry, we don&apos;t deliver to {form.pincode} yet. We currently deliver within {servedLabel}.</span>}
                  {pinComplete && pinServed && !pinMatchesState && <span className="text-red-700">PIN {form.pincode} isn&apos;t in the state you selected. Please check the PIN or state.</span>}
                  {pinComplete && !pinBlocked && <span className="text-green-700">✓ We deliver to {form.pincode}{sameDayPrefixes?.some(p => form.pincode.startsWith(p)) ? ", and same-day delivery is available" : ""}.</span>}
                </p>
              </div>
            </div>
            <div>
              <label htmlFor="checkout-state" className={labelClass}>State / Union Territory</label>
              <select id="checkout-state" name="stateCode" autoComplete="address-level1" required value={form.stateCode} onChange={handleChange} className={`${inputClass} bg-white`}>
                <option value="">Select state</option>
                {states.map(state => <option key={state.code} value={state.code}>{state.name}</option>)}
              </select>
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
                    className="min-w-0 flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand font-mono"
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
              {pack.groups.map(g => (
                <div key={g.group} className="flex items-center justify-between text-xs text-stone-600">
                  <span>Pack of {g.size}{g.packs > 1 ? ` × ${g.packs}` : ""}: {formatPrice(g.price)} a pack, that&apos;s {formatPrice(Math.round(g.price / g.size))} each</span>
                  <span>-{formatPrice(g.saving)}</span>
                </div>
              ))}
              {packRule && packUnits % packRule.size !== 0 && (
                <p className="text-[11px] text-stone-500">Add {packRule.size - (packUnits % packRule.size)} more to make a pack of {packRule.size} for {formatPrice(packRule.price)}, delivered free.</p>
              )}
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-green-600">
                  <span>Coupon Discount</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Shipping</span>
                <span>{shippingCharge > 0 ? `+${formatPrice(shippingCharge)}` : "Free"}</span>
              </div>
              {effectiveDelivery === "standard" && shippingCharge > 0 && packRule && <p className="text-[11px] text-stone-400">Delivery is free with a pack of {packRule.size} clips.</p>}
              <div className="flex items-center justify-between font-bold text-stone-800 text-base">
                <span>Estimated total</span>
                <span className="text-brand">{formatPrice(finalTotal)}</span>
              </div>
              {gstRegistered && <p className="text-[11px] text-stone-400 text-right">Prices include GST</p>}
            </div>

            {sameDayOffered && (
              <fieldset className="space-y-2 text-xs text-stone-600">
                <legend className={labelClass}>Delivery option</legend>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="deliveryMethod" value="standard" checked={effectiveDelivery === "standard"} onChange={() => setDeliveryMethod("standard")} className="mt-0.5 accent-brand" />
                  <span><strong>Standard</strong> · 2–5 working days · {formatPrice(singleItemShipping)} per order, free with a pack of 4 clips</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="deliveryMethod" value="same_day" checked={effectiveDelivery === "same_day"} disabled={!sameDayPinOk} onChange={() => setDeliveryMethod("same_day")} className="mt-0.5 accent-brand" />
                  <span><strong>Same-day</strong> · {formatPrice(sameDayShipping)} · Bengaluru PIN codes starting with {sameDayPrefixes!.join(", ")} only; orders after 2 PM go out the next working day</span>
                </label>
              </fieldset>
            )}

            <label className="flex items-start gap-3 text-xs leading-relaxed text-stone-600 cursor-pointer">
              <input type="checkbox" name="acceptTerms" required checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand" />
              <span>I agree to the <Link href="/terms" className="underline" target="_blank">Terms of Service</Link>, <Link href="/refunds" className="underline" target="_blank">Refund &amp; Cancellation Policy</Link> and <Link href="/shipping" className="underline" target="_blank">Shipping Policy</Link>.</span>
            </label>

            <p className="text-xs leading-relaxed text-stone-500">Price and availability are checked again before payment. Preparation and delivery vary by product and location.</p>

            {error && (
              <p className="text-red-500 text-xs leading-relaxed text-center mt-2">{error}</p>
            )}

            {pendingPayment && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs leading-relaxed text-amber-900"><p>Payment reference: <span className="break-all font-mono">{pendingPayment}</span></p><p className="mt-1">Please do not pay again while we confirm this payment.</p>{verificationResponse && <button type="button" disabled={loading} className="underline min-h-11" onClick={() => verifyPayment(verificationResponse)}>Retry confirmation</button>}<Link href="/contact" className="block underline min-h-11 pt-3">Contact support</Link></div>}

            <button
              type="submit"
              disabled={loading || !!pendingPayment || states.length === 0 || pinBlocked}
              className="btn-premium w-full justify-center disabled:opacity-60 mt-4"
            >
              {loading ? "Processing..." : pendingPayment ? "Payment confirmation pending" : `Continue to payment · ${formatPrice(finalTotal)}`}
            </button>
            {pinBlocked && <p className="text-xs text-red-700 text-center">Check the PIN code above: we can&apos;t deliver to this address yet.</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
