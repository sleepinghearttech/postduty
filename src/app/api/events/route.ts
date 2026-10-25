import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { supabaseAdmin } from "@/lib/supabase";
import { commerceTable } from "@/lib/commerce-db";
import { deviceClass, isBot, parseSiteEvent, placeFrom } from "@/lib/site-insights";

const SESSION_DAILY_CAP = 150;
const ok = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** Cookieless page/funnel events. Always answers 204 so a failure never affects shopping. */
export async function POST(request: NextRequest) {
  try {
    const ua = request.headers.get("user-agent");
    if (isBot(ua)) return ok();
    const origin = request.headers.get("origin");
    if (!origin || (!/^https:\/\/([a-z0-9-]+\.)*postduty\.in$/.test(origin) && origin !== request.nextUrl.origin)) return ok();
    if (Number(request.headers.get("content-length") ?? 0) > 2000) return ok();
    const raw = await request.text();
    if (raw.length > 2000) return ok();
    const row = parseSiteEvent(JSON.parse(raw));
    if (!row) return ok();
    let cf: Record<string, unknown> | undefined;
    try { cf = getCloudflareContext().cf as Record<string, unknown> | undefined; } catch { cf = undefined; }
    const place = placeFrom(cf, request.headers.get("cf-ipcountry"));
    // Flood guard: a real visit rarely exceeds a few dozen events; anything past the cap is dropped.
    const { count } = await supabaseAdmin.from(commerceTable("site_events")).select("id", { count: "exact", head: true }).eq("session_id", row.session_id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    if ((count ?? 0) >= SESSION_DAILY_CAP) return ok();
    // Retention: occasionally remove events older than 180 days.
    if (Math.random() < 0.01) await supabaseAdmin.from(commerceTable("site_events")).delete().lt("created_at", new Date(Date.now() - 180 * 86400000).toISOString());
    const { error } = await supabaseAdmin.from(commerceTable("site_events")).insert({ ...row, device: deviceClass(ua), ...place });
    if (error) console.error("[Insights] event not stored:", error.message);
  } catch { /* malformed body: ignore */ }
  return ok();
}
