import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CheckoutForm from "@/components/CheckoutForm";

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

type Props = {
  params: Promise<{ slug: string }>;
};

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

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand transition-colors mb-8"
      >
        ← All products
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 lg:gap-16">
        {/* Image */}
        <div className="aspect-square bg-brand-light rounded-2xl overflow-hidden">
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 leading-snug">
            {product.name}
          </h1>

          <p className="text-3xl font-bold text-brand mt-3">
            {formatPrice(product.price)}
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
    </main>
  );
}
