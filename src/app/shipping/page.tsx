import Link from "next/link";

export default function ShippingPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Shipping Policy</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">Last Updated: October 21, 2026</p>

      <div className="prose prose-stone max-w-none text-sm text-stone-600 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">1. Where We Deliver</h2>
          <p>
            We currently deliver only within <strong>Bengaluru</strong> (PIN codes starting with 560). Checkout will not accept addresses outside this area, so no payment is taken for an order we cannot deliver. We plan to add more locations soon. We do not ship internationally.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">2. Preparation Time</h2>
          <p>
            Our products are handmade in small batches. In-stock items are packed and handed over for delivery within <strong>1 to 3 working days</strong> of payment (Monday to Saturday, excluding public holidays). If a product page states a different preparation time, that time applies.
          </p>
          <p className="mt-2">
            If your order will take longer than promised, we will tell you by email or WhatsApp and you may cancel for a full refund.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">3. How We Deliver</h2>
          <p>
            Orders are delivered by local delivery partners within Bengaluru (for example, app-based parcel and courier services). Most orders arrive on the <strong>same or next working day</strong> after they are handed over. We will share the delivery partner&apos;s tracking link or details when your parcel leaves us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">4. Shipping Charges</h2>
          <p>
            Delivery costs <strong>₹49 for an order with a single item</strong> and is <strong>free for orders with two or more items</strong>. The exact delivery charge is shown in your cart before you pay.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">5. Order Tracking</h2>
          <p>
            You can check your order status at any time on the <Link href="/orders" className="text-brand hover:underline font-semibold">Track Order</Link> page using your Order ID and email or phone number.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">6. Damaged or Missing Parcels</h2>
          <p>
            If your parcel arrives damaged or does not arrive, contact us at <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a> within 48 hours of the expected delivery, with a photo of the parcel if it is damaged. We will replace the item or refund you in full, including the delivery charge.
          </p>
        </section>
      </div>
    </main>
  );
}
