import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
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
      <section className="bg-brand-light py-16 sm:py-24 px-4 text-center">
        <p className="text-brand text-xs font-bold tracking-widest uppercase mb-4">
          PostDuty
        </p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-stone-900 leading-tight max-w-xl mx-auto">
          Celebrate the caregivers in your life.
        </h1>
        <p className="mt-5 text-stone-500 text-base max-w-sm mx-auto leading-relaxed">
          Thoughtful gifts for nurses, doctors, and every healthcare hero who
          shows up every single day.
        </p>
        {products && products.length > 0 && (
          <a
            href="#products"
            className="mt-8 inline-block bg-brand text-white px-7 py-3 rounded-full text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            Shop gifts ↓
          </a>
        )}
      </section>

      {/* Product grid */}
      <section id="products" className="max-w-5xl mx-auto px-4 py-14">
        {!products || products.length === 0 ? (
          <p className="text-stone-400 text-center py-20">
            No products available right now.
          </p>
        ) : (
          <>
            <h2 className="text-xl font-bold text-stone-800 mb-8">
              Our collection
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {products.map((product: Product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-warm-border hover:shadow-lg hover:border-brand/30 transition-all duration-200"
                >
                  <div className="aspect-square overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <ProductImagePlaceholder />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-stone-800 text-sm leading-snug group-hover:text-brand transition-colors">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-base font-bold text-brand">
                        {formatPrice(product.price)}
                      </p>
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
