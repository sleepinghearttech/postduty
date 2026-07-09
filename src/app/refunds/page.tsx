export default function RefundsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Refund &amp; Cancellation Policy</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">Last Updated: July 7, 2026</p>
      
      <div className="prose prose-stone max-w-none text-sm text-stone-600 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">1. Return &amp; Replacement Window</h2>
          <p>
            At PostDuty, we want you to love your purchase. We offer a **7-day return and replacement policy** for items that are damaged, defective, or incorrect upon arrival. If 7 days have gone by since the date of delivery, we unfortunately cannot offer you a refund or replacement.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">2. Conditions for Return / Replacement</h2>
          <p>
            To be eligible for a return or replacement:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>The item must be unused, unwashed, and in the same condition that you received it.</li>
            <li>It must be in its original packaging.</li>
            <li>You must provide proof of purchase (such as your Order ID or receipt).</li>
            <li>For damaged or incorrect items, we request that you email us a photo or short unboxing video showing the issue within 48 hours of delivery to <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">3. Cancellations</h2>
          <p>
            You can request to cancel your order within **2 hours of placement**, provided the order has not already been prepared or dispatched. Once an order is processed or shipped, it cannot be cancelled. To cancel, please contact us immediately at <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a> with your Order ID.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">4. Refund Processing Time</h2>
          <p>
            Once your return is received and inspected, we will send you an email or WhatsApp notification to confirm receipt and notify you of the approval or rejection of your refund. 
          </p>
          <p className="mt-2">
            If approved, your refund will be processed, and the amount will be credited back to your **original payment method (via Razorpay) within 5 to 7 business days** in accordance with standard banking channels.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">5. Late or Missing Refunds</h2>
          <p>
            If you haven&apos;t received a refund yet, first check your bank account or contact your credit card issuer. It may take some time before your refund is officially posted. If you have done this and still have not received your refund, please reach out to us at <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a> and we will investigate immediately.
          </p>
        </section>
      </div>
    </main>
  );
}
