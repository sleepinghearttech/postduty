/**
 * First-party, cookieless insight rules shared by the event API, checkout and tests.
 * Dependency-free on purpose. Nothing here stores IP addresses, user agents or contact details.
 */
export const SITE_EVENTS = ["page_view", "product_view", "add_to_cart", "checkout_start"] as const;
export type SiteEventName = typeof SITE_EVENTS[number];
export type Device = "mobile" | "tablet" | "desktop";
export type Attribution = { source: string; medium: string | null; campaign: string | null; referrer_host: string | null; landing_path: string | null; first_seen_at: string | null; session_id: string | null };
export type Place = { country: string | null; region: string | null; city: string | null };

const OWN_HOSTS = /(^|\.)postduty\.in$|(^|\.)workers\.dev$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Printable, single-line text only; anything else is dropped rather than stored.
  const clean = value.replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);
  return clean || null;
}
function token(value: unknown, max: number): string | null {
  const clean = text(value, max)?.toLowerCase().replace(/[^a-z0-9._+-]/g, "_") ?? null;
  return clean && /[a-z0-9]/.test(clean) ? clean : null;
}
export function safePath(value: unknown): string | null {
  const raw = text(value, 400);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  // Paths only: query strings and fragments can hold tokens (order links, invites) and are never kept.
  return raw.split(/[?#]/)[0].slice(0, 200) || "/";
}
export function referrerHost(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return OWN_HOSTS.test(host) ? null : host.slice(0, 120);
  } catch { return null; }
}
/** utm_source wins; otherwise a known referrer family; otherwise the host; otherwise direct. */
export function sourceFor(utmSource: string | null, host: string | null): string {
  if (utmSource) return utmSource;
  if (!host) return "direct";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return "facebook";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(host)) return "x";
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(host)) return "linkedin";
  if (/(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(host)) return "search";
  return host;
}
export function sanitizeAttribution(value: unknown): Attribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const host = typeof v.referrer_host === "string" ? referrerHost(`https://${v.referrer_host}`) : null;
  const utm = token(v.source, 60);
  const seen = text(v.first_seen_at, 40);
  return {
    source: sourceFor(utm, host),
    medium: token(v.medium, 60),
    campaign: token(v.campaign, 80),
    referrer_host: host,
    landing_path: safePath(v.landing_path),
    first_seen_at: seen && Number.isFinite(Date.parse(seen)) ? new Date(seen).toISOString() : null,
    // Links a paid order to the visit it came from, so the funnel's last step counts real journeys.
    session_id: typeof v.session_id === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(v.session_id) ? v.session_id : null,
  };
}
export function deviceClass(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}
export function isBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? "";
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|node-fetch|axios|monitor/i.test(ua);
}
export function placeFrom(cf: Record<string, unknown> | null | undefined, countryHeader?: string | null): Place {
  const country = text(cf?.country, 2) ?? text(countryHeader, 2);
  return { country: country && /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : null, region: text(cf?.region, 80), city: text(cf?.city, 80) };
}
export type SiteEventRow = {
  event: SiteEventName; session_id: string; path: string; storefront: "general" | "christmas" | null; product_id: string | null;
  source: string; medium: string | null; campaign: string | null; referrer_host: string | null; landing_path: string | null;
};
/** Validates a browser-sent event. Returns null for anything malformed; the API ignores it. */
export function parseSiteEvent(value: unknown): SiteEventRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!SITE_EVENTS.includes(v.event as SiteEventName)) return null;
  if (typeof v.session_id !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(v.session_id)) return null;
  const path = safePath(v.path);
  if (!path) return null;
  const attribution = sanitizeAttribution(v.attribution) ?? sanitizeAttribution({});
  return {
    event: v.event as SiteEventName, session_id: v.session_id, path,
    storefront: v.storefront === "christmas" ? "christmas" : v.storefront === "general" ? "general" : null,
    product_id: typeof v.product_id === "string" && uuid.test(v.product_id) ? v.product_id.toLowerCase() : null,
    source: attribution!.source, medium: attribution!.medium, campaign: attribution!.campaign,
    referrer_host: attribution!.referrer_host, landing_path: attribution!.landing_path,
  };
}
