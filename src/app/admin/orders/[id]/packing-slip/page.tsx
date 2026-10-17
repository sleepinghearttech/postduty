import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireOwner } from '@/lib/commerce-auth';
import { commerceTable } from '@/lib/commerce-db';
import { supabaseAdmin } from '@/lib/supabase';
import { missingColumn } from '@/lib/business/queries';
import { packingSlipView, type PackingSlipItem, type PackingSlipOrder } from '@/lib/packing-slip';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packing slip — PostDuty', robots: { index: false, follow: false } };

const orderProjections = [
  'id,created_at,status,customer_name,customer_phone,shipping_address,is_gift,gift_message,shipping_details',
  'id,created_at,status,customer_name,customer_phone,shipping_address,is_gift,gift_message',
];
const itemProjections = [
  'quantity,product_name,variant_id,variant_name,personalization',
  'quantity,product_name,variant_id,personalization',
  'quantity',
];

async function firstWorking<T>(projections: string[], run: (projection: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>) {
  let result: { data: T | null; error: { code?: string } | null } = { data: null, error: null };
  for (const projection of projections) {
    result = await run(projection);
    if (!result.error || !missingColumn(result.error)) break;
  }
  return result;
}

export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  // Independent of middleware: customer addresses are owner-only.
  if (!await requireOwner()) redirect('/admin/login');
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const order = await firstWorking<PackingSlipOrder>(orderProjections, projection =>
    supabaseAdmin.from(commerceTable('orders')).select(projection).eq('id', id).maybeSingle() as unknown as PromiseLike<{ data: PackingSlipOrder | null; error: { code?: string } | null }>);
  if (order.error) throw new Error('Order records are unavailable.');
  if (!order.data) notFound();
  const items = await firstWorking<PackingSlipItem[]>(itemProjections, projection =>
    supabaseAdmin.from(commerceTable('order_items')).select(`${projection},products:${commerceTable('products')} ( name )`).eq('order_id', id) as unknown as PromiseLike<{ data: PackingSlipItem[] | null; error: { code?: string } | null }>);
  if (items.error) throw new Error('Order items are unavailable.');
  const slip = packingSlipView(order.data, items.data ?? []);

  return <main className="packing-slip mx-auto max-w-2xl bg-white p-6 text-stone-900 sm:p-10">
    <style>{'@media print{.commerce-top,.commerce-subnav,.commerce-bottom,.no-print{display:none!important}.commerce-admin{padding:0!important;background:#fff!important}.packing-slip{max-width:none;padding:0}}'}</style>
    <div className="no-print mb-6 flex items-center justify-between gap-3">
      <Link href="/admin/orders" className="text-sm underline">← Orders</Link>
      <PrintButton />
    </div>
    <header className="flex items-start justify-between gap-4 border-b border-stone-300 pb-4">
      <div><p className="text-2xl font-bold">PostDuty</p><p className="text-sm text-stone-500">Packing slip</p></div>
      <div className="text-right text-sm"><p className="font-mono font-semibold">#{slip.reference}</p><p>{new Date(slip.placedAt).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}</p>{slip.status !== 'paid' && <p className="uppercase text-xs text-stone-500">{slip.status}</p>}</div>
    </header>
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Deliver to</h2>
      <p className="mt-1 text-lg font-semibold">{slip.recipient}</p>
      {slip.addressLines.map((line, index) => <p key={index}>{line}</p>)}
      <p className="mt-1">Phone: {slip.phone}</p>
    </section>
    <table className="mt-8 w-full border-collapse text-sm">
      <thead><tr className="border-b border-stone-300 text-left"><th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Option</th><th className="py-2 text-right">Qty</th><th className="py-2 pl-4 text-center">Packed</th></tr></thead>
      <tbody>
        {slip.items.map((item, index) => <tr key={index} className="border-b border-stone-200 align-top">
          <td className="py-3 pr-2"><p className="font-medium">{item.name}</p>{item.personalization && <p className="mt-1 whitespace-pre-wrap break-words rounded bg-stone-100 p-2 text-xs"><strong>Personalisation:</strong> {item.personalization}</p>}</td>
          <td className="py-3 pr-2">{item.option ?? '—'}</td>
          <td className="py-3 text-right font-semibold">{item.quantity}</td>
          <td className="py-3 pl-4 text-center">☐</td>
        </tr>)}
      </tbody>
      <tfoot><tr><td colSpan={2} className="py-2 text-right text-stone-500">Total units</td><td className="py-2 text-right font-semibold">{slip.totalUnits}</td><td /></tr></tfoot>
    </table>
    {slip.giftMessage && <section className="mt-8 rounded border border-dashed border-stone-400 p-4"><h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Gift card message</h2><p className="mt-1 whitespace-pre-wrap">{slip.giftMessage}</p></section>}
  </main>;
}
