import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { stateName } from '@/lib/checkout-contract';
import { buildInvoice, sellerFromEnv, type InvoiceItem, type InvoiceOrder, type InvoiceView } from '@/lib/tax-invoice';

const ORDER_COLUMNS = 'id,status,created_at,total_amount,invoice_number,invoice_date,customer_name,customer_phone,shipping_address,shipping_details,tax_breakdown';

export type LoadedInvoice = { invoice: InvoiceView | null; customerPhone: string; sellerConfigured: boolean };

/** Reads one order's invoice. Returns null when the order does not exist; `invoice` is null for unnumbered orders. */
export async function loadInvoice(orderId: string): Promise<LoadedInvoice | null> {
  const { data: order, error } = await supabaseAdmin.from(commerceTable('orders')).select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  if (error) {
    // Before the phase B migration there are no invoice columns, and therefore no invoices.
    if (error.code === '42703') {
      const legacy = await supabaseAdmin.from(commerceTable('orders')).select('id,customer_phone').eq('id', orderId).maybeSingle();
      if (legacy.error) throw new Error('Orders unavailable');
      return legacy.data ? { invoice: null, customerPhone: legacy.data.customer_phone, sellerConfigured: false } : null;
    }
    throw new Error('Orders unavailable');
  }
  if (!order) return null;
  const typed = order as unknown as InvoiceOrder & { customer_phone: string };
  const seller = sellerFromEnv(process.env);
  if (!typed.invoice_number) return { invoice: null, customerPhone: typed.customer_phone, sellerConfigured: seller.configured };
  let itemResult = await supabaseAdmin.from(commerceTable('order_items')).select('line_index,quantity,product_name,variant_name,combo_role,combo_parent_line').eq('order_id', orderId);
  // Before the phase C migration there are no combo columns (and no combos).
  if (itemResult.error?.code === '42703') itemResult = await supabaseAdmin.from(commerceTable('order_items')).select('line_index,quantity,product_name,variant_name').eq('order_id', orderId) as typeof itemResult;
  const { data: items, error: itemError } = itemResult;
  if (itemError) throw new Error('Order items unavailable');
  return { invoice: buildInvoice(typed, (items ?? []) as InvoiceItem[], seller, stateName), customerPhone: typed.customer_phone, sellerConfigured: seller.configured };
}
