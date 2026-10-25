import { pinArea } from "../bengaluru-pins.ts";

/** Pure aggregation for the Insights "Customers & traffic" view. Counts only; no personal data passes through. */
export type AudienceEvent = { created_at: string; event: string; session_id: string; path: string; source: string | null; device: string | null; city: string | null; region: string | null; landing_path: string | null };
export type AudienceOrder = { id: string; created_at: string; total_amount: number; pincode: string | null; attribution: { source?: string | null; device?: string | null; campaign?: string | null; city?: string | null; session_id?: string | null } | null };
export type Row = { label: string; count: number; amount?: number };

const IST = 19800000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const istHour = (iso: string) => new Date(Date.parse(iso) + IST).getUTCHours();
export const istWeekday = (iso: string) => new Date(Date.parse(iso) + IST).getUTCDay();

function tally(entries: { label: string; amount?: number }[], limit = 10): Row[] {
  const map = new Map<string, Row>();
  for (const e of entries) {
    const row = map.get(e.label) ?? { label: e.label, count: 0, amount: 0 };
    row.count += 1; row.amount = (row.amount ?? 0) + (e.amount ?? 0);
    map.set(e.label, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || (b.amount ?? 0) - (a.amount ?? 0) || a.label.localeCompare(b.label)).slice(0, limit);
}
const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null;
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

export function summarizeAudience(events: AudienceEvent[], orders: AudienceOrder[]) {
  // One visit = one browser-tab session; its first event carries the source that brought it.
  const sessions = new Map<string, { first: AudienceEvent; events: Set<string> }>();
  for (const e of [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    const s = sessions.get(e.session_id);
    if (s) s.events.add(e.event); else sessions.set(e.session_id, { first: e, events: new Set([e.event]) });
  }
  const visits = [...sessions.values()];
  const reached = (name: string) => visits.filter(v => v.events.has(name)).length;
  const funnel = {
    visits: visits.length,
    productViews: reached("product_view"),
    addToCart: reached("add_to_cart"),
    checkoutStarts: reached("checkout_start"),
    // Only orders traced to a tracked visit, so every step is the same population and rates stay ≤ 100%.
    paidOrders: new Set(orders.flatMap(o => o.attribution?.session_id && sessions.has(o.attribution.session_id) ? [o.attribution.session_id] : [])).size,
    allPaidOrders: orders.length,
  };
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: hourLabel(h), orders: 0, visits: 0 }));
  for (const o of orders) hours[istHour(o.created_at)].orders += 1;
  for (const v of visits) hours[istHour(v.first.created_at)].visits += 1;
  const weekdays = WEEKDAYS.map((label, day) => ({ label, orders: orders.filter(o => istWeekday(o.created_at) === day).length, visits: visits.filter(v => istWeekday(v.first.created_at) === day).length }));
  const areas = orders.map(o => ({ o, place: pinArea(o.pincode) }));
  return {
    funnel,
    conversion: {
      visitToProduct: pct(funnel.productViews, funnel.visits),
      productToCart: pct(funnel.addToCart, funnel.productViews),
      cartToCheckout: pct(funnel.checkoutStarts, funnel.addToCart),
      checkoutToPaid: pct(funnel.paidOrders, funnel.checkoutStarts),
      visitToPaid: pct(funnel.paidOrders, funnel.visits),
    },
    hours, weekdays,
    busiestOrderHour: orders.length ? [...hours].sort((a, b) => b.orders - a.orders)[0] : null,
    visitSources: tally(visits.map(v => ({ label: v.first.source || "direct" }))),
    orderSources: tally(orders.map(o => ({ label: o.attribution?.source || "not recorded", amount: o.total_amount }))),
    orderCampaigns: tally(orders.filter(o => o.attribution?.campaign).map(o => ({ label: o.attribution!.campaign!, amount: o.total_amount }))),
    orderAreas: tally(areas.map(({ o, place }) => ({ label: place ? `${place.area} · ${place.pin}` : "PIN not recorded", amount: o.total_amount })), 15),
    orderZones: tally(areas.map(({ o, place }) => ({ label: place?.zone ?? "Unknown", amount: o.total_amount }))),
    orderDevices: tally(orders.map(o => ({ label: o.attribution?.device || "not recorded", amount: o.total_amount }))),
    visitDevices: tally(visits.map(v => ({ label: v.first.device || "unknown" }))),
    visitCities: tally(visits.map(v => ({ label: v.first.city ? `${v.first.city}${v.first.region ? `, ${v.first.region}` : ""}` : "Unknown" })), 12),
    landingPages: tally(visits.map(v => ({ label: v.first.landing_path || v.first.path }))),
    productPages: tally(events.filter(e => e.event === "product_view").map(e => ({ label: e.path.replace(/^\/products\//, "") }))),
  };
}
export type AudienceSummary = ReturnType<typeof summarizeAudience>;
