import Link from "next/link";

type Props = {
  searchParams: Promise<{ orderId?: string }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const { orderId } = await searchParams;

  return (
    <main className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-light mb-6">
        <svg
          className="w-8 h-8 text-brand"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-extrabold text-stone-900">
        Payment successful!
      </h1>
      <p className="mt-3 text-stone-500 text-sm leading-relaxed max-w-xs mx-auto">
        Thank you for your order. We&apos;ll pack it with care and ship it to you
        shortly.
      </p>

      {orderId && (
        <p className="mt-4 text-xs text-stone-400">
          Order reference:{" "}
          <span className="font-mono text-stone-600">{orderId}</span>
        </p>
      )}

      <Link
        href="/"
        className="mt-8 inline-block bg-brand text-white px-7 py-3 rounded-full text-sm font-semibold hover:bg-brand-dark transition-colors"
      >
        Back to shop
      </Link>
    </main>
  );
}
