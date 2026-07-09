import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

/** Check admin auth cookie — same pattern as other admin routes */
async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  return session?.value === process.env.ADMIN_SECRET;
}

/** GET /api/admin/coupons — list all coupons */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ coupons: data });
}

/** POST /api/admin/coupons — create a new coupon */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    code?: string;
    discount_type?: string;
    discount_value?: number;
    min_order?: number;
    max_uses?: number | null;
    expires_at?: string | null;
    referrer_code?: string | null;
  };

  if (!body.code || !body.discount_type || body.discount_value == null) {
    return NextResponse.json({ error: "code, discount_type, and discount_value are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("coupons")
    .insert({
      code: body.code.trim().toUpperCase(),
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      min_order: body.min_order ?? 0,
      max_uses: body.max_uses ?? null,
      expires_at: body.expires_at ?? null,
      referrer_code: body.referrer_code ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A coupon with this code already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ coupon: data }, { status: 201 });
}

/** PATCH /api/admin/coupons — update a coupon (toggle active, change value, etc.) */
export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    id: string;
    is_active?: boolean;
    discount_value?: number;
    min_order?: number;
    max_uses?: number | null;
    expires_at?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Coupon id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
  if (body.min_order !== undefined) updates.min_order = body.min_order;
  if (body.max_uses !== undefined) updates.max_uses = body.max_uses;
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at;

  const { data, error } = await supabaseAdmin
    .from("coupons")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ coupon: data });
}
