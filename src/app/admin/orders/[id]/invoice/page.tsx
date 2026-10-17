import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireOwner } from '@/lib/commerce-auth';
import { loadInvoice } from '@/lib/invoice-data';
import TaxInvoice from '@/components/commerce/TaxInvoice';
import PrintButton from '../packing-slip/PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoice — PostDuty', robots: { index: false, follow: false } };

export default async function OwnerInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  if (!await requireOwner()) redirect('/admin/login');
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const loaded = await loadInvoice(id);
  if (!loaded) notFound();
  return <main className="mx-auto max-w-3xl bg-white p-6 sm:p-10">
    <style>{'@media print{.commerce-top,.commerce-subnav,.commerce-bottom,.no-print{display:none!important}.commerce-admin{padding:0!important;background:#fff!important}}'}</style>
    <div className="no-print mb-6 flex items-center justify-between gap-3"><Link href="/admin/orders" className="text-sm underline">← Orders</Link>{loaded.invoice && <PrintButton label="Print invoice" />}</div>
    {!loaded.sellerConfigured && <p className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Seller legal name and address are not configured (SELLER_LEGAL_NAME, SELLER_ADDRESS). Set them before issuing invoices.</p>}
    {loaded.invoice && !loaded.invoice.reconciled && <p className="no-print mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">The invoice lines do not add up to the amount paid. Review this order before sharing the invoice.</p>}
    {loaded.invoice ? <TaxInvoice invoice={loaded.invoice} /> : <p className="text-sm text-stone-600">No invoice for this order. Invoices are numbered when a checkout payment is finalized; orders recorded before invoicing have none.</p>}
  </main>;
}
