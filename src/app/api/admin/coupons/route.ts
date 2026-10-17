import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { commerceTable } from '@/lib/commerce-db';
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { CouponInputError, validateCouponCreate, validateCouponUpdate } from '@/lib/coupon-admin';

const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/coupons — list all coupons */
export async function GET(request: NextRequest) {
  if (!(await requireOwner(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const { data, error } = await supabaseAdmin.from(commerceTable('coupons')).select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: 'Coupons are unavailable.' }, { status: 500, headers });
  return NextResponse.json({ coupons: data }, { headers });
}

/** POST /api/admin/coupons — create a coupon. Values are validated to match what checkout accepts. */
export async function POST(request: NextRequest) {
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  if (!(await requireOwner(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  let coupon;
  try { coupon = validateCouponCreate(body); } catch (error) {
    if (error instanceof CouponInputError) return NextResponse.json({ error: error.message }, { status: 400, headers });
    throw error;
  }
  const { data, error } = await supabaseAdmin.from(commerceTable('coupons')).insert(coupon).select().single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A coupon with this code already exists." }, { status: 409, headers });
    return NextResponse.json({ error: 'The coupon could not be created.' }, { status: 500, headers });
  }
  return NextResponse.json({ coupon: data }, { status: 201, headers });
}

/** PATCH /api/admin/coupons — update a coupon (toggle active, change value, limits or expiry). */
export async function PATCH(request: NextRequest) {
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  if (!(await requireOwner(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== 'string' || !uuid.test(body.id)) return NextResponse.json({ error: "Coupon id is required" }, { status: 400, headers });
  const { data: current, error: readError } = await supabaseAdmin.from(commerceTable('coupons')).select('id,discount_type').eq('id', body.id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Coupons are unavailable.' }, { status: 500, headers });
  if (!current) return NextResponse.json({ error: 'Coupon not found.' }, { status: 404, headers });
  let updates;
  try { updates = validateCouponUpdate(body, current.discount_type === 'flat' ? 'flat' : 'percent'); } catch (error) {
    if (error instanceof CouponInputError) return NextResponse.json({ error: error.message }, { status: 400, headers });
    throw error;
  }
  const { data, error } = await supabaseAdmin.from(commerceTable('coupons')).update(updates).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: 'The coupon could not be updated.' }, { status: 500, headers });
  return NextResponse.json({ coupon: data }, { headers });
}
