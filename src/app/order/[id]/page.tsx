import Link from "next/link";
import OrderStatusClient from "./OrderStatusClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ storefront?: string }>;
};

export const metadata = {
  title: "Order status — PostDuty",
};

export default async function OrderStatusPage({ params, searchParams }: Props) {
  const { id } = await params;
  const christmas = (await searchParams).storefront === "christmas";

  return (
    <main className="max-w-md mx-auto px-4 py-10 sm:py-14">
      <Link
        href={christmas ? "/christmas" : "/store"}
        className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand transition-colors mb-8"
      >
        ← Back to {christmas ? "Christmas" : "the store"}
      </Link>

      <h1 className="text-2xl font-extrabold text-stone-900 mb-2">Track your order</h1>
      <p className="text-sm text-stone-500 mb-6">
        Enter the phone number used at checkout to view this order&apos;s status.
      </p>

      <OrderStatusClient orderId={id} />
    </main>
  );
}
