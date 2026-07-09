import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import type { Product, Coupon } from "@/lib/types";
import Link from "next/link";
import ReferralBanner from "./ReferralBanner";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params;

  // Look up the coupon linked to this referrer code
  const { data: coupon } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("referrer_code", code.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (!coupon) {
    // No valid referral — just redirect to homepage
    redirect("/");
  }

  const c = coupon as Coupon;

  // Check if expired or maxed out
  const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
  const isMaxed = c.max_uses !== null && c.times_used >= c.max_uses;

  if (isExpired || isMaxed) {
    redirect("/");
  }

  const discountLabel =
    c.discount_type === "percent"
      ? `${c.discount_value}% off`
      : `₹${(c.discount_value / 100).toFixed(0)} off`;

  // Fetch active products for the grid
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return (
    <main>
      {/* Referral Banner — Client Component that saves code to localStorage */}
      <ReferralBanner
        referrerCode={code}
        couponCode={c.code}
        discountLabel={discountLabel}
      />

      {/* Product Grid (same as homepage) */}
      <section className="max-w-6xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-extrabold text-stone-900 mb-6">
          Shop Our Collection
        </h2>

        {!products || products.length === 0 ? (
          <p className="text-stone-500">Products coming soon!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(products as Product[]).map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className="group bg-white border border-warm-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300"
              >
                <div className="aspect-square bg-brand-light relative overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-16 h-16 text-brand opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-stone-800 text-sm leading-snug group-hover:text-brand transition-colors">
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="font-bold text-brand">
                      {(product.price / 100).toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                      {discountLabel} with code {c.code}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
