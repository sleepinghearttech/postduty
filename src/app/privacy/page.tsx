export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Privacy Policy</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">Last Updated: July 7, 2026</p>
      
      <div className="prose prose-stone max-w-none text-sm text-stone-600 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">1. Information We Collect</h2>
          <p>
            When you purchase something from our store, as part of the buying and selling process, we collect the personal information you give us, such as your name, email address, phone number, and shipping address. This information is necessary to verify payments, fulfill your order, and communicate shipping updates.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">2. Consent</h2>
          <p>
            When you provide us with personal information to complete a transaction, verify your payment method, place an order, or arrange for a delivery, we imply that you consent to our collecting it and using it for that specific reason only. We will also use your phone number and email to send order confirmation and shipping tracking messages.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">3. Razorpay &amp; Payment Security</h2>
          <p>
            Payments on our website are processed through Razorpay. We do not store or capture any credit card or debit card details on our servers. Razorpay processes transactions securely and complies with all PCI-DSS requirements to ensure the protection of your financial data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">4. Third-Party Services</h2>
          <p>
            In general, the third-party providers used by us will only collect, use, and disclose your information to the extent necessary to allow them to perform the services they provide to us. These include:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Supabase:</strong> For secure database hosting and order storage.</li>
            <li><strong>Resend:</strong> For dispatching transactional email notifications.</li>
            <li><strong>Meta Graph API (WhatsApp):</strong> For delivering automated order alerts and tracking details.</li>
            <li><strong>Shiprocket:</strong> For processing shipment labels and logistics.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">5. Data Retention &amp; Security</h2>
          <p>
            To protect your personal information, we take reasonable precautions and follow industry best practices to make sure it is not inappropriately lost, misused, accessed, disclosed, altered, or destroyed. We retain your order history (excluding financial details) to verify transactions, support refunds, and allow you to track order updates.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">6. Changes to this Policy</h2>
          <p>
            We reserve the right to modify this privacy policy at any time, so please review it frequently. Changes and clarifications will take effect immediately upon their posting on the website.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-stone-800 uppercase tracking-wider mb-2">7. Contact &amp; Questions</h2>
          <p>
            If you would like to access, correct, amend, or delete any personal information we have about you, register a complaint, or simply want more information, contact us at <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">postdutyswag@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
