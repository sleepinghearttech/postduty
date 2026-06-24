import Link from "next/link";

type Props = {
  searchParams: Promise<{ orderId?: string }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const { orderId } = await searchParams;

  return (
    <main className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-6">🎉</div>
      <h1 className="text-2xl font-bold">Payment successful!</h1>
      <p className="mt-3 text-gray-600 text-sm">
        Thank you for your order. We will pack and ship it shortly.
      </p>

      {orderId && (
        <p className="mt-4 text-xs text-gray-400">
          Order reference: <span className="font-mono">{orderId}</span>
        </p>
      )}

      <Link
        href="/"
        className="mt-8 inline-block bg-black text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
      >
        Back to shop
      </Link>
    </main>
  );
}
