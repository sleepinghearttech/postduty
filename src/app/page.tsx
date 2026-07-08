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

  return (
    <main>
      {/* Hero */}
      <section className="hero-wash py-20 sm:py-28 px-4 text-center">
        <p className="eyebrow">For those who show up</p>
        <hr className="rule-gold mx-auto my-4" />
        <h1 className="font-serif text-4xl sm:text-6xl font-semibold text-ink-900 leading-[1.1] max-w-2xl mx-auto">
          Small things that carry the shift.
        </h1>
        <p className="mt-5 text-ink-400 text-base max-w-md mx-auto leading-relaxed">
          Considered, durable accessories for doctors, nurses &amp; students
          across India.
        </p>
        {products && products.length > 0 && (
          <a href="#products" className="btn-premium mt-8">
            Explore the collection
          </a>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-ink-400">
          <span><b className="text-ink-700">Prepaid</b> · secure checkout</span>
          <span><b className="text-ink-700">24–48h</b> dispatch</span>
          <span><b className="text-ink-700">Tracked</b> delivery</span>
        </div>
      </section>

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
  );
}
