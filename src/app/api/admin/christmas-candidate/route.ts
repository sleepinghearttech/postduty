import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const allowedStatuses = new Set([
  "candidate",
  "shortlisted",
  "approved",
  "test_printed",
  "live",
  "rejected",
]);

export async function POST(request: NextRequest) {
  const session = request.cookies.get("admin_session")?.value;
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    status?: string;
    suggestedPriceRupees?: number;
    notes?: string;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!allowedStatuses.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (body.suggestedPriceRupees !== undefined) {
    updates.suggested_price_paise = Math.max(
      0,
      Math.round(body.suggestedPriceRupees * 100)
    );
  }

  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabaseAdmin
    .from("christmas_product_candidates")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidate: data });
}
