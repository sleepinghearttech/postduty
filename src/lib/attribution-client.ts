"use client";
/**
 * Browser side of first-party insights. No cookies: a random per-tab session id lives in
 * sessionStorage, and the first-touch source (UTM tags or referring site) in localStorage for
 * 30 days so a later purchase can be credited to the visit that brought the customer.
 */
const ATTR_KEY = "pd_attribution";
const SESSION_KEY = "pd_session";
const FIRST_TOUCH_MS = 30 * 24 * 60 * 60 * 1000;

export type ClientAttribution = { source: string | null; medium: string | null; campaign: string | null; referrer_host: string | null; landing_path: string; first_seen_at: string };

function storage(kind: "local" | "session"): Storage | null {
  try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function sessionId(): string {
  const store = storage("session");
  let id = store?.getItem(SESSION_KEY) ?? "";
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    try { store?.setItem(SESSION_KEY, id); } catch { /* private mode: one id per page load */ }
  }
  return id;
}

/** Captures UTM tags or an outside referrer. A new tagged visit replaces the stored first touch. */
export function captureAttribution(): ClientAttribution {
  const store = storage("local");
  const params = new URLSearchParams(window.location.search);
  let referrerHost: string | null = null;
  try { referrerHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : null; } catch { referrerHost = null; }
  if (referrerHost && /(^|\.)postduty\.in$/.test(referrerHost)) referrerHost = null;
  const fresh: ClientAttribution = {
    source: params.get("utm_source"), medium: params.get("utm_medium"), campaign: params.get("utm_campaign"),
    referrer_host: referrerHost, landing_path: window.location.pathname, first_seen_at: new Date().toISOString(),
  };
  let stored: ClientAttribution | null = null;
  try { stored = JSON.parse(store?.getItem(ATTR_KEY) ?? "null") as ClientAttribution | null; } catch { stored = null; }
  const expired = !stored || !(Date.now() - Date.parse(stored.first_seen_at) < FIRST_TOUCH_MS);
  const tagged = !!(fresh.source || fresh.referrer_host);
  if (expired || tagged) {
    try { store?.setItem(ATTR_KEY, JSON.stringify(fresh)); } catch { /* storage blocked */ }
    return fresh;
  }
  return stored!;
}

export function storedAttribution(): ClientAttribution | null {
  try { return JSON.parse(storage("local")?.getItem(ATTR_KEY) ?? "null") as ClientAttribution | null; } catch { return null; }
}

export function trackEvent(event: "page_view" | "product_view" | "add_to_cart" | "checkout_start", extra: { product_id?: string; storefront?: string } = {}) {
  try {
    const body = JSON.stringify({ event, session_id: sessionId(), path: window.location.pathname, attribution: storedAttribution(), ...extra });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", blob)) void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch { /* insights never break shopping */ }
}
