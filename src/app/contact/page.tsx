export default function ContactPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Contact Us</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">We are here to help you</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left column - details */}
        <div className="prose prose-stone text-sm text-stone-600 space-y-6 leading-relaxed">
          <p>
            Have a question about our products, an active order, shipping, or returns? Get in touch with us! We will respond to your queries within 24 business hours.
          </p>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Email Support</h3>
            <p className="text-base font-semibold text-stone-800">
              <a href="mailto:hello@postduty.in" className="text-brand hover:underline">
                hello@postduty.in
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">WhatsApp / Call</h3>
            <p className="text-base font-semibold text-stone-800">
              +91 [PHONE_NUMBER]
            </p>
            <p className="text-xs text-stone-400 mt-0.5">Monday to Saturday: 10:00 AM – 6:00 PM</p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Office / Mailing Address</h3>
            <p className="text-sm font-medium text-stone-800 leading-normal whitespace-pre-wrap">
              [BUSINESS_NAME]
              [REGISTERED_ADDRESS]
              India
            </p>
            <p className="text-xs text-stone-400 mt-2">GSTIN: [GSTIN_PLACEHOLDER]</p>
          </div>
        </div>

        {/* Right column - grievance details required by Indian law */}
        <div className="bg-stone-50 rounded-2xl border border-warm-border p-6 md:p-8">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Grievance Officer</h2>
          <p className="text-xs text-stone-500 leading-relaxed mb-6">
            In accordance with the Information Technology Act 2000 and the Consumer Protection (E-Commerce) Rules 2020, the name and contact details of the Grievance Officer are provided below:
          </p>

          <div className="space-y-4 text-sm text-stone-600">
            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Name</p>
              <p className="font-semibold text-stone-800">[GRIEVANCE_OFFICER_NAME]</p>
            </div>
            
            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Designation</p>
              <p className="font-medium text-stone-800">Customer Support Lead &amp; Grievance Officer</p>
            </div>

            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Email</p>
              <p className="font-semibold text-stone-800">
                <a href="mailto:hello@postduty.in" className="text-brand hover:underline">
                  hello@postduty.in
                </a>
              </p>
              <p className="text-xs text-stone-400 mt-1">Please include your Order ID in the email subject for faster resolution.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
