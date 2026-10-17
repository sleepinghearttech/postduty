import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import { orderConfirmation, validOrderReference } from '@/components/commerce/order-outcome';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Order confirmation — PostDuty',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ orderId?: string; storefront?: string }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  noStore();
  const query = await searchParams;
  const orderId = validOrderReference(query.orderId) ? query.orderId : null;
  // These server-only lookups never render customer data, totals or provider IDs.
  // A historical paid label alone is not proof of a captured payment.
  const result = orderId
    ? await supabaseAdmin.from(commerceTable('orders'))
        .select('id,status,storefront,is_test,total_amount,checkout_intent_id').eq('id', orderId).maybeSingle()
    : null;
  const payment = result?.data && !result.error
    ? await supabaseAdmin.from(commerceTable('checkout_payments'))
        .select('order_id,intent_id,amount,currency,status,is_test,provider_verified_at')
        .eq('order_id', orderId).maybeSingle()
    : null;
  const confirmation = result?.error ? null : orderConfirmation(result?.data, payment?.error ? null : payment?.data, isCommerceSandbox());
  if (confirmation && orderId && query.storefront !== confirmation.storefront) {
    redirect(`/order-success?orderId=${orderId}&storefront=${confirmation.storefront}`);
  }
  const host = (await headers()).get('host')?.split(':')[0].toLowerCase();
  const storefront = confirmation?.storefront ??
    (host === 'christmas.postduty.in' || query.storefront === 'christmas' ? 'christmas' : 'general');
  const christmas = storefront === 'christmas';
  const browseHref = christmas ? '/christmas' : '/store';
  const title = confirmation?.verified
    ? confirmation.testMode ? 'Test checkout complete' : 'Your order is confirmed'
    : confirmation ? 'Your order is recorded' : 'Check your order confirmation';

  return (
    <main className="max-w-lg mx-auto px-5 py-14 sm:py-20 text-center">
      <p className="text-[10px] tracking-[.18em] uppercase text-stone-500 mb-7">
        {christmas ? 'Christmas by PostDuty' : 'The PostDuty Store'}
      </p>
      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full border mb-6 ${confirmation?.verified ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`} aria-hidden="true">
        {confirmation?.verified ? <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <span className="text-2xl">…</span>}
      </div>
      <h1 className="font-serif text-3xl text-stone-900">{title}</h1>
      <p className="mt-4 text-stone-600 text-sm leading-relaxed max-w-sm mx-auto">
        {confirmation?.verified
          ? confirmation.testMode
            ? 'Razorpay test payment verification completed and a test order was recorded. No real payment or shipment is expected.'
            : 'Your verified payment and order have been recorded. Check your order status for fulfillment and tracking updates.'
          : confirmation
            ? 'This order is recorded, but verified payment evidence is unavailable here. Check its status or contact support before paying again.'
            : 'We could not confirm a completed order from this reference. If you attempted payment, check the order status or contact support before paying again.'}
      </p>
      {confirmation?.testMode && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">Preview only · This test order is excluded from real sales and revenue.</p>}
      {orderId && <div className="mt-7 space-y-5">
        <p className="text-xs text-stone-500">Order reference<br/><span className="inline-block mt-2 font-mono text-stone-700 select-all break-all">{orderId}</span></p>
        <Link href={`/order/${orderId}?storefront=${storefront}`} className="btn-premium">{confirmation?.testMode ? 'View test order status' : 'Check order status'} →</Link>
      </div>}
      {!confirmation?.verified && <Link href="/contact" className="inline-block mt-5 text-sm text-brand underline underline-offset-4">Contact support</Link>}
      <div className="pt-9 flex flex-col gap-4 items-center">
        <Link href={browseHref} className="text-xs font-semibold text-stone-600 underline underline-offset-4">Back to {christmas ? 'the Christmas collection' : 'the PostDuty Store'}</Link>
        {!confirmation?.verified && <Link href={`/cart?storefront=${storefront}`} className="text-xs text-stone-500 underline underline-offset-4">Return to your bag</Link>}
      </div>
    </main>
  );
}
