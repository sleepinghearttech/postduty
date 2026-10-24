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
            We currently deliver only within <strong>Karnataka</strong>. Checkout will not accept addresses outside Karnataka, so no payment is taken for an order we cannot deliver. We plan to add more states soon. We do not ship internationally.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">2. Preparation Time</h2>
          <p>
            Our products are handmade in small batches. For standard delivery, in-stock items are packed and handed over within <strong>1 to 3 working days</strong> of payment (Monday to Saturday, excluding public holidays). If a product page states a different preparation time, that time applies.
          </p>
          <p className="mt-2">
            If your order will take longer than promised, we will tell you by email or WhatsApp and you may cancel for a full refund.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">3. How We Deliver</h2>
          <p>
            You can choose between two options at checkout:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Standard delivery (all of Karnataka):</strong> sent by India Post Speed Post or a courier, usually arriving <strong>2 to 5 working days</strong> after it is handed over.</li>
            <li><strong>Same-day delivery (Bengaluru, PIN codes starting with 560):</strong> delivered by a local parcel service. Paid orders received before 2 PM on a working day are delivered the same day when the item is in stock; later orders go out the next working day.</li>
          </ul>
          <p className="mt-2">We share the tracking number or delivery partner details when your parcel leaves us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">4. Shipping Charges</h2>
          <p>
            Standard delivery costs <strong>₹49 per order</strong> and is <strong>free when your order includes a pack of 4 crochet clips</strong> (any 4 clips for ₹300). Same-day delivery costs a flat <strong>₹99</strong> per order. The exact delivery charge is shown in your cart before you pay.
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
            If your parcel arrives damaged or does not arrive, contact us at <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a> within 7 days of delivery (or of the expected delivery date, if it never arrives), with a photo of the parcel if it is damaged. We will replace the item or refund you in full, including the delivery charge.
          </p>
        </section>
      </div>
    </main>
  );
}
