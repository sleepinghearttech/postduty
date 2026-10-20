// Seller details come from runtime configuration, never from this public repository.
export const dynamic = "force-dynamic";

function sellerDetails() {
  const clean = (v: string | undefined) => v?.trim() || null;
  return {
    legalName: clean(process.env.SELLER_LEGAL_NAME),
    address: clean(process.env.SELLER_ADDRESS),
    phone: clean(process.env.SELLER_PHONE),
    grievanceOfficer: clean(process.env.GRIEVANCE_OFFICER_NAME),
  };
}

export default function ContactPage() {
  const seller = sellerDetails();
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-serif text-3xl text-ink-900 mb-2">Contact Us</h1>
      <hr className="rule-gold mb-4" />
      <p className="text-xs text-stone-400 mb-8">We are here to help you</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left column - details */}
        <div className="prose prose-stone text-sm text-stone-600 space-y-6 leading-relaxed">
          <p>
            Have a question about our products, an active order, delivery, or returns? Get in touch with us! We will respond to your queries within 24 business hours.
          </p>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Email Support</h3>
            <p className="text-base font-semibold text-stone-800">
              <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">
                postdutyswag@gmail.com
              </a>
            </p>
          </div>

          {seller.phone && (
            <div>
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Phone / WhatsApp</h3>
              <p className="text-base font-semibold text-stone-800">
                <a href={`tel:${seller.phone.replace(/[^\d+]/g, "")}`} className="text-brand hover:underline">{seller.phone}</a>
              </p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Support hours</h3>
            <p className="text-xs text-stone-500">Monday to Saturday: 10:00 AM – 6:00 PM</p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Business details</h3>
            {seller.legalName && seller.address ? (
              <p className="text-xs text-stone-500 leading-relaxed">
                PostDuty is a sole proprietorship of <strong>{seller.legalName}</strong>.<br />
                {seller.address}<br />
                Country of origin of all products: India.
              </p>
            ) : (
              <p className="text-xs text-stone-500 leading-relaxed">
                Our registered business name, address and phone number will be
                published here before ordering opens.
              </p>
            )}
          </div>
        </div>

        {/* Right column - grievance details required by Indian law */}
        <div className="bg-stone-50 rounded-2xl border border-warm-border p-6 md:p-8">
          <h2 className="text-lg font-bold text-stone-800 mb-4">Grievance Officer</h2>
          <p className="text-xs text-stone-500 leading-relaxed mb-6">
            Complaints are handled under the Information Technology Act 2000 and the Consumer Protection (E-Commerce) Rules 2020. We acknowledge every complaint within 48 hours and resolve it within one month of receipt.
          </p>

          <div className="space-y-4 text-sm text-stone-600">
            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Name &amp; designation</p>
              <p className="font-medium text-stone-800">{seller.grievanceOfficer ? `${seller.grievanceOfficer}, Proprietor & Grievance Officer` : "Customer Support Lead & Grievance Officer"}</p>
            </div>

            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Email</p>
              <p className="font-semibold text-stone-800">
                <a href="mailto:postdutyswag@gmail.com" className="text-brand hover:underline">
                  postdutyswag@gmail.com
                </a>
              </p>
              <p className="text-xs text-stone-400 mt-1">Please include your Order ID in the email subject for faster resolution.</p>
            </div>

            {seller.phone && (
              <div>
                <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Phone</p>
                <p className="font-semibold text-stone-800">{seller.phone}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
