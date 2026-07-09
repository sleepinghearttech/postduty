import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendFollowUpDay1WhatsApp, sendFollowUpDay5WhatsApp } from "@/lib/notifications";
import { sendFollowUpDay1Email, sendFollowUpDay5Email, sendWinBackEmail } from "@/lib/email";
import type { Order } from "@/lib/types";

// Win-back offer sent after 60 days of inactivity — matches the seeded POSTDUTY50 coupon.
const WINBACK_COUPON_CODE = "POSTDUTY50";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily post-purchase follow-up job (Playbook §5.1).
 *   delivered + 1 day  -> "did it arrive OK" (WhatsApp + email)
 *   delivered + 5 days -> review ask, 10% off next order (WhatsApp + email)
 *   last order + 60 days, no newer order -> win-back, POSTDUTY50 (email only)
 *
 * Not wired to a native Cloudflare Cron Trigger: @opennextjs/cloudflare's
 * generated Worker only exports `fetch`, not `scheduled` -- a `crons` block
 * in wrangler.jsonc would be dead config with this stack. Trigger this route
 * daily from an external scheduler instead (e.g. cron-job.org, free tier)
 * hitting this URL with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const results = { day1: 0, day5: 0, winback: 0, errors: [] as string[] };

  // ---- Day 1 follow-up: delivered >= 1 day ago, not yet sent ----
  try {
    const { data: day1Orders, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("status", "delivered")
      .eq("followup_day1_sent", false)
      .not("delivered_at", "is", null)
      .lte("delivered_at", new Date(now - DAY_MS).toISOString());

    if (error) throw error;

    for (const order of (day1Orders ?? []) as Order[]) {
      try {
        await sendFollowUpDay1WhatsApp(order);
        await sendFollowUpDay1Email(order);
        await supabaseAdmin.from("orders").update({ followup_day1_sent: true }).eq("id", order.id);
        results.day1++;
      } catch (err) {
        results.errors.push(`day1 order ${order.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    results.errors.push(`day1 query: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ---- Day 5 follow-up: delivered >= 5 days ago, not yet sent ----
  try {
    const { data: day5Orders, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("status", "delivered")
      .eq("followup_day5_sent", false)
      .not("delivered_at", "is", null)
      .lte("delivered_at", new Date(now - 5 * DAY_MS).toISOString());

    if (error) throw error;

    for (const order of (day5Orders ?? []) as Order[]) {
      try {
        await sendFollowUpDay5WhatsApp(order);
        await sendFollowUpDay5Email(order);
        await supabaseAdmin.from("orders").update({ followup_day5_sent: true }).eq("id", order.id);
        results.day5++;
      } catch (err) {
        results.errors.push(`day5 order ${order.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    results.errors.push(`day5 query: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ---- Win-back: order >= 60 days old, not yet sent, no newer order from the same customer ----
  try {
    const { data: staleOrders, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("winback_sent", false)
      .lte("created_at", new Date(now - 60 * DAY_MS).toISOString());

    if (error) throw error;

    for (const order of (staleOrders ?? []) as Order[]) {
      try {
        const { data: newerOrders } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("customer_email", order.customer_email)
          .gt("created_at", order.created_at)
          .limit(1);

        if (newerOrders && newerOrders.length > 0) {
          // Customer already ordered again -- mark this stale order as
          // handled so we don't keep re-checking it, but skip the email.
          await supabaseAdmin.from("orders").update({ winback_sent: true }).eq("id", order.id);
          continue;
        }

        await sendWinBackEmail(order, WINBACK_COUPON_CODE);
        await supabaseAdmin.from("orders").update({ winback_sent: true }).eq("id", order.id);
        results.winback++;
      } catch (err) {
        results.errors.push(`winback order ${order.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    results.errors.push(`winback query: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ ok: true, ...results });
}
