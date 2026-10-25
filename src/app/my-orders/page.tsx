import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { commerceTable } from "@/lib/commerce-db";
import { normalizeOrderEmail, verifyOrdersToken } from "@/lib/order-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My orders — PostDuty", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { searchParams: Promise<{ e?: string; t?: string }> };
type OrderRow = { id: string; created_at: string; total_amount: number; status: string; tracking_number: string | null; storefront: string | null };
type LineRow = { order_id: string; product_name: string | null; quantity: number; combo_role: string | null; fulfillment_status: string | null; tracking_number: string | null; tracking_url: string | null };

const STATUS: Record<string, string> = { paid: "Confirmed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded" };
const money = (paise: number) => (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const safeHttps = (url: string | null) => { try { return url && new URL(url).protocol === "https:" ? url : null; } catch { return null; } };

/** All orders for one email, reached only through the signed link in that customer's order emails. No address or phone is shown. */
export default async function MyOrdersPage({ searchParams }: Props) {
  const { e, t } = await searchParams;
  const email = typeof e === "string" ? normalizeOrderEmail(e) : "";
  const valid = email.length > 3 && email.length < 255 && typeof t === "string" && verifyOrdersToken(email, t);
  if (!valid) return <Shell><p className="text-sm text-stone-600">This link is invalid or incomplete. Please open the &ldquo;See all my orders&rdquo; link from your PostDuty order email, or <Link href="/orders" className="underline">track an order</Link> with its order ID.</p></Shell>;

  const { data: orders, error } = await supabaseAdmin.from(commerceTable("orders")).select("id,created_at,total_amount,status,tracking_number,storefront")
    // Checkout stores emails lower-cased, so an exact match is safe (ilike would treat % and _ as wildcards).
    .eq("customer_email", email).eq("is_test", false).or("payment_mode.is.null,payment_mode.neq.test").in("status", Object.keys(STATUS)).order("created_at", { ascending: false }).limit(50);
  if (error) return <Shell><p className="text-sm text-stone-600">Your orders could not be loaded right now. Please try again in a moment.</p></Shell>;
  const list = (orders ?? []) as OrderRow[];
  const { data: lines } = list.length ? await supabaseAdmin.from(commerceTable("order_items")).select("order_id,product_name,quantity,combo_role,fulfillment_status,tracking_number,tracking_url").in("order_id", list.map(o => o.id)) : { data: [] };
  const byOrder = new Map<string, LineRow[]>();
  for (const line of (lines ?? []) as LineRow[]) if (line.combo_role !== "component") byOrder.set(line.order_id, [...(byOrder.get(line.order_id) ?? []), line]);

  return <Shell>
    <p className="text-sm text-stone-600 mb-6">Orders placed with <strong>{email}</strong>. Keep this link private; anyone with it can see this list.</p>
    {!list.length ? <p className="text-sm text-stone-600">No orders yet. <Link href="/store" className="underline">Browse the store</Link>.</p> :
      <ul className="space-y-4">{list.map(order => {
        const items = byOrder.get(order.id) ?? [];
        const tracking = items.find(l => l.tracking_number) ?? null;
        return <li key={order.id} className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs text-stone-500">{new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · Order {order.id.slice(0, 8)}</p>
              <p className="mt-1 text-sm font-semibold text-stone-800">{items.map(l => `${l.product_name ?? "Item"} × ${l.quantity}`).join(", ") || "Your order"}</p></div>
            <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{STATUS[order.status] ?? order.status}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-stone-700">{money(order.total_amount)}</span>
            <span className="flex flex-wrap gap-3">
              {(tracking?.tracking_number || order.tracking_number) && (safeHttps(tracking?.tracking_url ?? null)
                ? <a className="underline" href={safeHttps(tracking!.tracking_url)!} target="_blank" rel="noreferrer">Courier tracking: {tracking!.tracking_number}</a>
                : <span className="text-stone-600">Tracking: {tracking?.tracking_number || order.tracking_number}</span>)}
              <Link className="underline" href={`/order/${encodeURIComponent(order.id)}${order.storefront === "christmas" ? "?storefront=christmas" : ""}`}>Order details</Link>
            </span>
          </div>
        </li>;
      })}</ul>}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
    <Link href="/store" className="text-sm text-stone-500 hover:underline">← Back to the store</Link>
    <h1 className="mt-6 mb-2 text-2xl font-extrabold text-stone-900">My orders</h1>
    {children}
  </main>;
}
