import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import CheckoutForm from "@/components/CheckoutForm";

function formatPriceAmount(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const { data: product } = await supabase
    .from("products")
    .select("name, description, image_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!product) {
    return { title: "Product not found — PostDuty" };
  }

  const title = `${product.name} — PostDuty`;
  const description =
    product.description ?? "Thoughtful gifts for nurses, doctors, and every healthcare hero.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !product) {
    notFound();
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postduty.jijo925.workers.dev";

  // JSON-LD structured data for Google rich snippets
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? "Thoughtful gifts for healthcare heroes",
    image: product.image_url ?? undefined,
    url: `${baseUrl}/products/${product.slug}`,
    brand: {
      "@type": "Brand",
      name: "PostDuty",
    },
    offers: {
      "@type": "Offer",
      price: (product.price / 100).toFixed(2),
      priceCurrency: "INR",
      availability: product.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${baseUrl}/products/${product.slug}`,
      seller: {
        "@type": "Organization",
        name: "PostDuty",
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand transition-colors mb-8"
      >
        ← All products
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 lg:gap-16">
        {/* Image */}
        <div className="card-premium aspect-square bg-brand-light">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg
                className="w-16 h-16 text-brand opacity-25"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <h1 className="font-serif text-3xl text-ink-900 leading-snug">
            {product.name}
          </h1>

          <p className="price-tag text-2xl mt-3">
            <span className="cur">₹</span>
            {formatPriceAmount(product.price)}
          </p>

          {product.description && (
            <p className="mt-5 text-stone-600 text-sm leading-relaxed">
              {product.description}
            </p>
          )}

          {product.stock > 0 ? (
            <p className="mt-3 text-xs text-green-700 font-semibold">
              ✓ In stock — ready to ship
            </p>
          ) : (
            <p className="mt-3 text-xs text-red-400 font-medium">
              Out of stock
            </p>
          )}

          {/* CheckoutForm handles the Buy Now button, form, and payment modal */}
          <CheckoutForm product={product} />

          <Link href="/" className="btn-ghost mt-3 self-start">
            Continue shopping
          </Link>

          {/* Trust signals */}
          <div className="mt-6 pt-6 border-t border-warm-border grid grid-cols-3 gap-3 text-center">
            <div className="flex flex-col items-center gap-1">
              <svg className="w-5 h-5 text-brand opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-xs font-semibold text-stone-700 leading-tight">Secure payment</p>
              <p className="text-xs text-stone-400 leading-tight">via Razorpay</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <svg className="w-5 h-5 text-brand opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-xs font-semibold text-stone-700 leading-tight">Ships India-wide</p>
              <p className="text-xs text-stone-400 leading-tight">All states</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <svg className="w-5 h-5 text-brand opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p className="text-xs font-semibold text-stone-700 leading-tight">Prepaid only</p>
              <p className="text-xs text-stone-400 leading-tight">Online payment</p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ & Reviews Section */}
      <section className="mt-16 sm:mt-24 border-t border-warm-border pt-12 sm:pt-16 grid grid-cols-1 md:grid-cols-2 gap-12 sm:gap-16">
        {/* FAQ Accordion */}
        <div>
          <h2 className="text-xl font-bold text-stone-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <FAQItem
              question="Can I customize the keychain?"
              answer="Currently, our Nurse Character Keychain comes as standard. However, we are preparing custom tags and name engraving for bulk orders soon. Contact us for custom queries."
            />
            <FAQItem
              question="How long does shipping take?"
              answer="Orders are prepared and shipped within 1-2 business days. Delivery across India typically takes 3 to 7 business days depending on your city and state."
            />
            <FAQItem
              question="What is your return policy?"
              answer="We offer a 7-day return or replacement window if your product arrives damaged or incorrect. Please send a photo or video to postdutyswag@gmail.com within 48 hours of delivery."
            />
            <FAQItem
              question="Are payments secure?"
              answer="Yes, all transactions are processed securely via Razorpay. PostDuty does not store or see any card details or passwords."
            />
          </div>
        </div>

        {/* Customer Reviews */}
        <div>
          <h2 className="text-xl font-bold text-stone-900 mb-6">Customer Reviews</h2>
          <div className="space-y-4">
            <ReviewItem
              name="Dr. Rahul Mehta"
              role="Resident Doctor"
              rating={5}
              date="2 weeks ago"
              comment="Bought this keychain for my colleague. The quality is outstanding, and the ampule opener function is actually very neat and works perfectly!"
            />
            <ReviewItem
              name="Jisha Mathew"
              role="Registered Nurse (ICU)"
              rating={5}
              date="3 weeks ago"
              comment="Super cute keychain! It is lightweight but strong. My fellow nurses in the ward keep asking where I got it from."
            />
            <ReviewItem
              name="Amrit Pal Singh"
              role="Medical Student"
              rating={5}
              date="1 month ago"
              comment="The shipping was fast, and the packaging was lovely. Really nice token of appreciation for someone in healthcare."
            />
          </div>
        </div>
      </section>
    </main>
    </>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group border-b border-warm-border pb-4 cursor-pointer">
      <summary className="flex justify-between items-center font-bold text-stone-800 text-sm list-none outline-none">
        <span>{question}</span>
        <span className="text-brand transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <p className="mt-2 text-stone-500 text-xs leading-relaxed transition-all duration-300">
        {answer}
      </p>
    </details>
  );
}

function ReviewItem({
  name,
  role,
  rating,
  date,
  comment,
}: {
  name: string;
  role: string;
  rating: number;
  date: string;
  comment: string;
}) {
  return (
    <div className="bg-white border border-warm-border rounded-xl p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-stone-800">{name}</span>
          <span className="text-[10px] text-stone-400 block">{role}</span>
        </div>
        <span className="text-[10px] text-stone-400">{date}</span>
      </div>
      <div className="flex gap-0.5 my-2">
        {Array.from({ length: rating }).map((_, i) => (
          <svg key={i} className="w-3 h-3 text-gold" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.6l-5.18 2.84.99-5.77-4.19-4.08 5.79-.84L10 1.5z" />
          </svg>
        ))}
      </div>
      <p className="text-stone-600 text-xs leading-relaxed">{comment}</p>
    </div>
  );
}
