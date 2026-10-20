export default function RefundsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Refund &amp; Cancellation Policy</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">Last Updated: October 21, 2026</p>

      <div className="prose prose-stone max-w-none text-sm text-stone-600 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">1. Cancellations</h2>
          <p>
            You can cancel your order for a <strong>full refund at any time before it is handed over for delivery</strong>. Email <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a> with your Order ID. Personalised or made-to-order items can be cancelled for a full refund until we start making them; the product page tells you if an item is made to order.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">2. Damaged, Defective, Wrong or Late Items</h2>
          <p>
            If an item arrives damaged, defective, different from its description, or much later than the promised time, tell us within <strong>7 days of delivery</strong>. A photo or short video of the problem helps us resolve it quickly. You can choose a <strong>replacement or a full refund, including the delivery charge</strong>. If we need the item back, we arrange and pay for the pickup.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">3. Change of Mind</h2>
          <p>
            Because our products are handmade in small batches and hair accessories are personal items, we do not accept returns for a change of mind once an item has been delivered. This does not limit your rights in section 2.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">4. Refund Processing Time</h2>
          <p>
            Approved refunds are credited to your <strong>original payment method (via Razorpay) within 5 to 7 business days</strong>, depending on your bank. We email you when the refund is issued.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">5. Late or Missing Refunds</h2>
          <p>
            If you haven&apos;t received a refund yet, first check your bank account or contact your card issuer. If you still have not received it, write to <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a> and we will investigate immediately.
          </p>
        </section>
      </div>
    </main>
  );
}
