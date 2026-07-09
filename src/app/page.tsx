import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

function formatPriceAmount(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function ProductImagePlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-brand-light">
      <svg
        className="w-14 h-14 text-brand opacity-30"
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
  );
}

export default async function HomePage() {
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load products:", error.message);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postduty.jijo925.workers.dev";

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PostDuty",
    url: baseUrl,
    description: "Thoughtful gifts for nurses, doctors, and every healthcare hero.",
    contactPoint: {
      "@type": "ContactPoint",
      email: "postdutyswag@gmail.com",
      contactType: "customer service",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
    <main>
      {/* Hero — "the slide" */}
      <section className="hero-wash grain-texture relative overflow-hidden py-20 sm:py-28 px-4 text-center">
        {/* Gold corner flourishes */}
        <svg className="corner-flourish absolute top-6 left-6 w-10 h-10 sm:w-14 sm:h-14 hidden sm:block" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <path d="M2 2v18M2 2h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <svg className="corner-flourish absolute bottom-6 right-6 w-10 h-10 sm:w-14 sm:h-14 hidden sm:block" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <path d="M54 54V36M54 54H36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        <p className="eyebrow reveal-up">For those who show up</p>
        <hr className="rule-gold mx-auto my-4 reveal-up" />
        <h1 className="reveal-up-delay-1 font-serif text-4xl sm:text-6xl font-semibold text-ink-900 leading-[1.1] max-w-2xl mx-auto">
          Small things that carry the shift.
        </h1>
        <p className="reveal-up-delay-1 mt-5 text-ink-400 text-base max-w-md mx-auto leading-relaxed">
          Considered, durable accessories for doctors, nurses &amp; students
          across India.
        </p>
        {products && products.length > 0 && (
          <a href="#products" className="reveal-up-delay-2 btn-premium mt-8">
            Explore the collection
          </a>
        )}
        <div className="reveal-up-delay-2 mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs text-ink-400">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <b className="text-ink-700">Prepaid</b>&nbsp;· secure checkout
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <b className="text-ink-700">24–48h</b>&nbsp;dispatch
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-brand opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <b className="text-ink-700">Tracked</b>&nbsp;delivery
          </span>
        </div>
      </section>

      {/* Section divider — subtle scalloped edge between hero and grid */}
      <svg className="block w-full text-warm-bg" style={{ height: "18px" }} viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 Q 10 12 20 0 Q 30 12 40 0 Q 50 12 60 0 Q 70 12 80 0 Q 90 12 100 0 Q 110 12 120 0 V12 H0 Z" fill="currentColor" />
      </svg>

      {/* Product grid */}
      <section id="products" className="max-w-5xl mx-auto px-4 py-14">
        {!products || products.length === 0 ? (
          <p className="text-stone-400 text-center py-20">
            No products available right now.
          </p>
        ) : (
          <>
            <h2 className="font-serif text-2xl text-ink-900 mb-2">
              Our collection
            </h2>
            <hr className="rule-gold mb-8" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {products.map((product: Product, index: number) => (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className="card-premium group flex flex-col relative"
                >
                  {index === 0 && (
                    <span className="absolute top-2 left-2 bg-white text-brand text-[10px] font-bold px-2 py-1 rounded-full shadow-sm z-10">
                      Bestseller
                    </span>
                  )}
                  <div className="aspect-square overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-light to-gold-soft">
                        <ProductImagePlaceholder />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-ink-900 font-semibold text-sm leading-snug group-hover:text-brand transition-colors">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between mt-2">
                      <span className="price-tag">
                        <span className="cur">₹</span>
                        {formatPriceAmount(product.price)}
                      </span>
                      {product.stock === 0 ? (
                        <span className="text-xs text-red-400 font-medium">
                          Out of stock
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400 group-hover:text-brand transition-colors font-medium">
                          View →
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
    </>
  );
}
