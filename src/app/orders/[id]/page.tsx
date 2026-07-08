import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";

type Props = {
  params: Promise<{ id: string }>;
};

function formatPrice(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    dateStyle: "medium",
  });
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  // 1. Fetch order details
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    notFound();
  }

  // 2. Fetch order items
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select(`
      id,
      quantity,
      unit_price,
      products (
        name,
        image_url
      )
    `)
    .eq("order_id", id);

  const orderItems = items || [];

  // Mask sensitive address information for guest tracking privacy
  const addressLines = order.shipping_address.split("\n");
  const cityStateZip = addressLines[addressLines.length - 1] || "";
  const maskedAddress = `Delivery to: ***, ${cityStateZip}`;

  const isPaid = order.status === "paid" || order.status === "shipped";
  const isShipped = order.status === "shipped";

  return (
    <main className="max-w-xl mx-auto px-4 py-12 sm:py-16">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-brand transition-colors mb-6 uppercase tracking-wider"
      >
        ← Track another order
      </Link>

      <div className="bg-white border border-warm-border rounded-2xl p-6 md:p-8 shadow-sm">
        {/* Header */}
        <div className="border-b border-warm-border pb-5 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 leading-none">Order Status</h1>
            <p className="text-xs text-stone-400 mt-2 font-mono uppercase">
              Ref: #{order.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <span className="text-xs text-stone-400 font-medium">
            {formatDate(order.created_at)}
          </span>
        </div>

        {/* Tracking Timeline */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">
            Progress Timeline
          </h2>
          <div className="space-y-6">
            {/* Step 1 - Paid */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${isPaid ? "bg-emerald-500" : "bg-stone-200"}`}>
                  {isPaid ? "✓" : "1"}
                </div>
                <div className={`w-0.5 h-10 ${isShipped ? "bg-emerald-500" : "bg-stone-200"}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-800">Payment Confirmed</p>
                <p className="text-xs text-stone-500">We have received your payment and are preparing your order.</p>
              </div>
            </div>

            {/* Step 2 - Shipped */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${isShipped ? "bg-emerald-500" : "bg-stone-200"}`}>
                  {isShipped ? "✓" : "2"}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-stone-800">Shipped / Dispatched</p>
                {isShipped ? (
                  <>
                    <p className="text-xs text-stone-500">Your package is with the courier partner.</p>
                    <div className="mt-3 bg-stone-50 border border-warm-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                          AWB Tracking Number
                        </p>
                        <p className="text-sm font-mono font-bold text-brand mt-0.5">
                          {order.tracking_number}
                        </p>
                      </div>
                      <a
                        href={`https://shiprocket.co/tracking/${order.tracking_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-premium text-xs px-3 py-1.5"
                      >
                        Track Shipment ↗
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-stone-500">Tracking code will be assigned once shipped.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Masked Shipping Privacy Details */}
        <div className="border-t border-warm-border pt-6 mb-6">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
            Shipping Information
          </h2>
          <p className="text-sm text-stone-600 font-medium leading-relaxed">
            {maskedAddress}
          </p>
        </div>

        {/* Ordered items */}
        <div className="border-t border-warm-border pt-6 space-y-4">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
            Items Ordered
          </h2>
          {orderItems.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-4 text-sm">
              <div className="w-12 h-12 bg-brand-light rounded-lg overflow-hidden flex-shrink-0">
                {item.products?.image_url ? (
                  <img
                    src={item.products.image_url}
                    alt={item.products.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-brand opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-800 truncate text-xs">{item.products?.name || "Product"}</p>
                <p className="text-stone-400 text-[10px] mt-0.5">Qty: {item.quantity}</p>
              </div>
              <p className="font-bold text-stone-700 text-xs">{formatPrice(item.unit_price * item.quantity)}</p>
            </div>
          ))}

          <div className="border-t border-warm-border pt-4 flex items-center justify-between font-bold text-stone-900 text-sm">
            <span>Total Paid</span>
            <span className="text-brand">{formatPrice(order.total_amount)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
