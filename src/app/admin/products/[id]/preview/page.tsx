/* eslint-disable @next/next/no-img-element -- Owner-supplied public media supports preview without image proxy transformations. */
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireOwner } from '@/lib/commerce-auth';
import { loadOwnerProduct } from '@/lib/product-admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Private product preview — PostDuty', robots: { index: false, follow: false } };

export default async function ProductPreview({ params }: { params: Promise<{ id: string }> }) {
  if (!await requireOwner()) redirect('/admin/login');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await loadOwnerProduct(id);
  if (!product) notFound();
  const media = product.commerce?.media?.length ? product.commerce.media : product.image_url ? [{ type: 'image' as const, url: product.image_url, alt: product.name }] : [];
  return <main className="mx-auto max-w-4xl p-4 pb-24">
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Private saved-product preview</strong><p>This preview does not publish the product. Unsaved editor changes are not shown.</p><Link className="mt-2 inline-block underline" href="/admin/products">Back to products</Link></div>
    <div className="grid gap-8 md:grid-cols-2"><div className="space-y-3">{media.length ? media.map((item,index) => <figure key={`${item.url}-${index}`} className="overflow-hidden rounded-2xl bg-stone-100">{item.type === 'video' ? <video src={item.url} controls playsInline className="w-full" /> : <img src={item.url} alt={item.alt} className="aspect-square w-full object-contain" />}</figure>) : <div className="flex aspect-square items-center justify-center rounded-xl bg-stone-100 text-stone-500">Add a product photo</div>}</div>
    <section><p className="text-xs uppercase tracking-widest text-stone-500">{product.commerce?.category || 'PostDuty'}</p><h1 className="mt-3 text-3xl font-semibold text-stone-900">{product.name}</h1><p className="mt-3 text-xl">₹{(product.price/100).toLocaleString('en-IN',{minimumFractionDigits:2})}</p><p className="mt-4 text-stone-600">{product.commerce?.short_description}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-700">{product.description}</p><p className="mt-5 text-sm">{product.commerce?.made_to_order ? 'Made to order' : `${product.stock} available`}{product.commerce?.preparation_days ? ` · Preparation estimate: ${product.commerce.preparation_days} days` : ''}</p>{product.commerce?.variants?.map(v => <p className="mt-2 rounded border p-3 text-sm" key={v.id}>{v.name} · ₹{(v.price/100).toFixed(2)} · {v.stock} available</p>)}{product.commerce?.personalization?.enabled && <div className="mt-5"><label className="text-sm">{product.commerce.personalization.label}</label><input disabled placeholder="Customer personalization appears here" className="mt-2 w-full rounded-lg border p-3" /></div>}<p className="mt-6 rounded-lg bg-stone-100 p-3 text-sm">Assigned storefronts: {(product.commerce?.storefronts ?? ['general']).join(', ')} · {product.is_active ? 'Published' : product.commerce?.archived ? 'Archived' : 'Draft'}</p><button disabled className="mt-5 w-full rounded-xl bg-stone-900 p-4 text-white opacity-50">Cart unavailable in private preview</button></section></div>
  </main>;
}
