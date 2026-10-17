import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import CheckoutForm from "@/components/CheckoutForm";
import { isHiddenProduct, PUBLIC_PRODUCT_COLUMNS } from "@/lib/hidden-products";

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
    .select(PUBLIC_PRODUCT_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !product || isHiddenProduct(product.slug)) {
    notFound();
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postduty.jijo925.workers.dev";
  // Catalogue-only mode: show the product and price, but no purchase controls or purchasable Offer data.
  const catalogOnly = process.env.COMMERCE_CATALOG_ONLY === "true";

  const offers = {
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
  };

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
    ...(catalogOnly ? {} : { offers }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
      <Link
        href="/store"
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

          {catalogOnly ? (
            <div className="mt-4">
              {product.stock > 0 ? null : (
                <p className="text-xs text-red-400 font-medium">Out of stock</p>
              )}
              <p className="mt-2 text-sm text-stone-600">
                Ordering opens soon. Browse the designs and details here.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}

          <Link href="/store" className="btn-ghost mt-3 self-start">
            Continue shopping
          </Link>

          {/* Trust signals */}
          {!catalogOnly && (
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
          )}
        </div>
      </div>

      {/* FAQ & Reviews Section */}
      <section className="mt-16 sm:mt-24 border-t border-warm-border pt-12 sm:pt-16 grid grid-cols-1 md:grid-cols-2 gap-12 sm:gap-16">
        {/* FAQ Accordion */}
        <div>
          <h2 className="text-xl font-bold text-stone-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <FAQItem
              question="Can I request a custom or bulk order?"
              answer="Write to postdutyswag@gmail.com with what you have in mind and we will tell you what is possible."
            />
            <FAQItem
              question="How long does shipping take?"
              answer="Preparation time depends on the product, and made-to-order items take longer. After dispatch, delivery across India typically takes 3 to 7 business days depending on your city and state."
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
          <p className="text-sm text-stone-500 leading-relaxed">
            No verified customer reviews are available yet. Reviews will appear here
            only after genuine orders.
          </p>
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
