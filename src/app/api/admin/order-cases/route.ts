import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { commerceTable } from '@/lib/commerce-db';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderCaseError, parseOrderCaseCommand, requireCaseUuid, assertCaseAmount, assertCaseTransition, type OrderCase } from '@/lib/order-cases';

const headers = { 'Cache-Control': 'private, no-store' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
function failure(error: unknown) {
  return error instanceof OrderCaseError ? json({ error: error.message }, error.status) : json({ error: 'Service records are unavailable. Your existing orders and payments are unchanged.' }, 503);
}
export async function GET(request: NextRequest) {
  if (!await requireOwner(request)) return json({ error: 'Owner access required.' }, 401);
  try {
    const orderId = requireCaseUuid(request.nextUrl.searchParams.get('order_id'));
    const { data, error } = await supabaseAdmin.from(commerceTable('order_cases')).select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return json({ cases: data ?? [], manual_record_only: true });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return json({ error: 'Owner access required.' }, 401);
  if (!isAllowedMutationOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 16000) return json({ error: 'Service request is too large.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new OrderCaseError('Enter a valid service request.'); }
    const command = parseOrderCaseCommand(body);
    if (command.action === 'create') {
      const { data: order, error } = await supabaseAdmin.from(commerceTable('orders')).select('id,total_amount').eq('id', command.order_id).maybeSingle();
      if (error) throw error;
      if (!order) throw new OrderCaseError('The order was not found.', 404);
      assertCaseAmount(command, order.total_amount);
    } else {
      const { data: record, error } = await supabaseAdmin.from(commerceTable('order_cases')).select('*').eq('id', command.id).maybeSingle();
      if (error) throw error;
      if (!record) throw new OrderCaseError('The service case was not found.', 404);
      assertCaseTransition(record as OrderCase, command);
    }
    const { data, error } = await supabaseAdmin.rpc(commerceTable('save_order_case'), { p_command: command });
    if (error) {
      const safeErrors: Record<string, [string, number]> = {
        case_conflict: ['This case changed. Refresh cases before making another decision.', 409],
        case_invalid_transition: ['This case transition is not allowed.', 409],
        case_amount_invalid: ['The requested amount cannot exceed the order total.', 400],
        case_not_found: ['The service case or order was not found.', 404],
        case_reference_required: ['An external resolution reference is required.', 400],
      };
      const match = Object.entries(safeErrors).find(([key]) => error.message?.includes(key));
      if (match) throw new OrderCaseError(match[1][0], match[1][1]);
      throw error;
    }
    return json({ case: data, manual_record_only: true, message: 'Manual record saved. No funds moved, notifications sent, or order/inventory states changed.' });
  } catch (error) { return failure(error); }
}
