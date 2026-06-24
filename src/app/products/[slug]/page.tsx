import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to all products
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-sm">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover rounded-xl"
            />
          ) : (
            "No image yet"
          )}
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-bold leading-snug">{product.name}</h1>
            <p className="text-2xl font-bold mt-3">{formatPrice(product.price)}</p>

            {product.description && (
              <p className="mt-4 text-gray-600 text-sm leading-relaxed">
                {product.description}
              </p>
            )}

            <p className="mt-4 text-sm text-gray-500">
              {product.stock > 0
                ? `${product.stock} in stock`
                : "Out of stock"}
            </p>
          </div>

          <button
            disabled={product.stock === 0}
            className="mt-8 w-full bg-black text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
          >
            {product.stock === 0 ? "Out of stock" : "Buy Now"}
          </button>
        </div>
      </div>
    </main>
  );
}
