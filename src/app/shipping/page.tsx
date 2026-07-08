export default function ShippingPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Shipping Policy</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">Last Updated: July 7, 2026</p>
      
      <div className="prose prose-stone max-w-none text-sm text-stone-600 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">1. Shipping Coverage</h2>
          <p>
            We ship to addresses across India. Currently, we use reliable shipping partners (including Shiprocket and associated national couriers) to ensure your package arrives safely. We do not support international shipping at this time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">2. Processing Time</h2>
          <p>
            All orders are processed and prepared for shipping within **1 to 2 business days** of receiving your payment. Orders are not processed or shipped on Sundays or national holidays. 
          </p>
          <p className="mt-2">
            If we experience a high volume of orders, shipments may be delayed by a few days. If there is a significant delay in the shipment of your order, we will contact you via email or WhatsApp.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">3. Delivery Timelines</h2>
          <p>
            Once shipped, the estimated delivery time is **3 to 7 business days** depending on your location:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Metro Cities:</strong> 3 to 4 business days.</li>
            <li><strong>Other Cities &amp; Towns:</strong> 4 to 6 business days.</li>
            <li><strong>Northeast, J&amp;K, and Remote Locations:</strong> 6 to 8 business days.</li>
          </ul>
          <p className="mt-2 text-stone-500 text-xs italic">
            *Please note that delivery timelines are estimates and can occasionally be affected by weather conditions, carrier delays, or local lockdowns.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">4. Shipping Charges</h2>
          <p>
            Shipping rates will be displayed at checkout before you make your payment. We may offer free shipping for orders exceeding a certain amount or run promotional flat rates, which will be highlighted on the storefront.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">5. Shipment Tracking</h2>
          <p>
            Once your package is dispatched, you will receive a WhatsApp message and/or email containing your **Shiprocket AWB tracking number** and a link to trace your delivery status. You can also track your order status directly on our website by visiting the <a href="/orders" className="text-brand hover:underline font-semibold">Track Order</a> page.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">6. Damaged / Lost Shipments</h2>
          <p>
            If your package is damaged during transit, please save all packaging materials and damaged goods, and contact us immediately at <a href="mailto:hello@postduty.in" className="text-brand hover:underline">hello@postduty.in</a> with a photo/video within 48 hours of receipt so we can arrange a replacement.
          </p>
        </section>
      </div>
    </main>
  );
}
