import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Private "all my orders" links. A link carries the customer's email and an HMAC of it, so only someone holding
 * the emailed link can list that email's orders. No account or password. Server-only.
 */
const STORE_URL = "https://store.postduty.in";

function linkKey(env: Record<string, string | undefined> = process.env): string | null {
  // A dedicated secret when set; otherwise a key derived from the server-only Supabase service key.
  const base = env.ORDER_LINKS_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return base && base.length >= 16 ? createHmac("sha256", base).update("postduty:my-orders:v1").digest("hex") : null;
}

export function normalizeOrderEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function ordersToken(email: string, env?: Record<string, string | undefined>): string | null {
  const key = linkKey(env);
  return key ? createHmac("sha256", key).update(normalizeOrderEmail(email)).digest("base64url") : null;
}

export function verifyOrdersToken(email: string, token: string, env?: Record<string, string | undefined>): boolean {
  const expected = ordersToken(email, env);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function myOrdersUrl(email: string, env?: Record<string, string | undefined>): string | null {
  const token = ordersToken(email, env);
  return token ? `${STORE_URL}/my-orders?e=${encodeURIComponent(normalizeOrderEmail(email))}&t=${token}` : null;
}

export function orderStatusUrl(orderId: string, storefront?: string | null): string {
  return `${STORE_URL}/order/${encodeURIComponent(orderId)}${storefront === "christmas" ? "?storefront=christmas" : ""}`;
}
