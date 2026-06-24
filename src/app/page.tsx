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
    <main className="max-w-5xl mx-auto px-4 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">PostDuty</h1>
        <p className="text-gray-500 mt-1">Gifts for healthcare workers</p>
      </header>

      {!products || products.length === 0 ? (
        <p className="text-gray-400">No products available right now.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {products.map((product: Product) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="group border rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-gray-100 rounded-lg mb-4 flex items-center justify-center text-gray-300 text-sm">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  "No image yet"
                )}
              </div>
              <h2 className="font-semibold text-sm leading-snug group-hover:underline">
                {product.name}
              </h2>
              <p className="mt-1 text-base font-bold">{formatPrice(product.price)}</p>
              {product.stock === 0 && (
                <p className="mt-1 text-xs text-red-500">Out of stock</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
