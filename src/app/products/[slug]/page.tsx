/* eslint-disable @next/next/no-img-element -- Owner-approved creator photos are external HTTPS images. */
import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import Link from 'next/link';
import type {Metadata} from 'next';
import CheckoutForm from '@/components/CheckoutForm';
import ProductGallery from '@/components/commerce/ProductGallery';
import {getStoreProduct,getCreatorProfile} from '@/components/commerce/catalog-data';
import {madeByLine} from '@/lib/creator-profile';
import {productStock,productHref,type Storefront} from '@/components/commerce/types';
import {isCommerceSandbox} from '@/lib/commerce-db';
import styles from '@/components/commerce/commerce.module.css';
import { isCatalogOnly } from '@/lib/catalog-mode';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string}>;searchParams:Promise<{storefront?:string}>};
async function context(searchParams:Props['searchParams']):Promise<Storefront|null>{
  const query=(await searchParams).storefront;const host=(await headers()).get('host')?.split(':')[0].toLowerCase();
  if(query&&query!=='christmas'&&query!=='general')return null;
  const hostStore=host==='christmas.postduty.in'?'christmas':host==='store.postduty.in'?'general':null;
  if(hostStore&&query&&hostStore!==query)return null;
  return hostStore ?? (query as Storefront | undefined) ?? 'general';
}
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata>{
  const {slug}=await params;const storefront=await context(searchParams);const p=storefront&&await getStoreProduct(slug,storefront);
  if(!p)return{title:'Product not found — PostDuty',robots:{index:false}};
  const title=p.commerce?.seo_title||`${p.name} — PostDuty`;const description=p.commerce?.seo_description||p.commerce?.short_description||p.description||'Explore this piece from the PostDuty collection.';
  return{title,description,robots:isCommerceSandbox()?{index:false,follow:false}:undefined,openGraph:{title,description,images:p.image_url?[{url:p.image_url}]:undefined}};
}
export default async function ProductPage({params,searchParams}:Props){
  const {slug}=await params;const storefront=await context(searchParams);if(!storefront)notFound();const product=await getStoreProduct(slug,storefront);if(!product)notFound();
  const catalogOnly=isCatalogOnly()||product.commerce?.catalog_only===true;
  const creator=product.creator_id?await getCreatorProfile(product.creator_id):null;
  const c=product.commerce;const base=storefront==='christmas'?'https://christmas.postduty.in':'https://store.postduty.in';
  const variantPrices = c?.variants?.map(v=>v.price) ?? [];
  const offers = variantPrices.length ? {'@type':'AggregateOffer',lowPrice:(Math.min(...variantPrices)/100).toFixed(2),highPrice:(Math.max(...variantPrices)/100).toFixed(2),offerCount:variantPrices.length,priceCurrency:'INR'} : {'@type':'Offer',price:(product.price/100).toFixed(2),priceCurrency:'INR',availability:productStock(product)>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:base+productHref(product,storefront)};
  const jsonLd={'@context':'https://schema.org','@type':'Product',name:product.name,description:product.description??undefined,image:product.image_url??undefined,sku:c?.sku,url:base+productHref(product,storefront),brand:{'@type':'Brand',name:'PostDuty'},...(catalogOnly?{}:{offers})};
  return <main className={`${styles.productPage} ${storefront==='christmas'?styles.festiveProduct:''}`}>
    {isCommerceSandbox()?<div className={styles.previewNotice}>Fictional preview product · Not a live offer for sale</div>:<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/>}
    <div className={styles.productInner}><Link className={styles.backLink} href={storefront==='christmas'?'/christmas':'/store'}>← {storefront==='christmas'?'The Christmas collection':'The PostDuty Store'}</Link>
      <div className={styles.productColumns}><ProductGallery product={product}/><div className={styles.productInformation}><p className={styles.eyebrow}>{c?.category||'PostDuty collection'}</p><h1>{product.name}</h1>{c?.short_description&&<p className={styles.productIntro}>{c.short_description}</p>}{creator&&<aside className="my-4 flex items-start gap-3 rounded-2xl border border-stone-200 bg-white/70 p-3" aria-label="About the maker">{creator.photo_url&&<img src={creator.photo_url} alt={creator.display_name} className="h-14 w-14 flex-shrink-0 rounded-full object-cover"/>}<div><p className="text-sm font-semibold">{madeByLine(creator)}</p>{creator.bio&&<p className="mt-1 text-sm leading-6 text-stone-600">{creator.bio}</p>}</div></aside>}<CheckoutForm product={product} storefront={storefront} catalogOnly={catalogOnly}/>
        <div className={styles.productDetails}><details open><summary>The details</summary><p>{product.description||'More details are being added. Please contact us with questions before ordering.'}</p>{c?.materials&&<p><strong>Materials:</strong> {c.materials}</p>}{c?.dimensions&&<p><strong>Dimensions:</strong> {c.dimensions}</p>}{c?.weight_grams!=null&&<p><strong>Weight:</strong> {c.weight_grams} g</p>}</details><details><summary>Preparation &amp; delivery</summary>{c?.made_to_order&&<p>This piece is made to order.</p>}{c?.preparation_days!=null?<p>Estimated preparation: {c.preparation_days} {c.preparation_days===1?'working day':'working days'}. This does not include delivery time.</p>:<p>Contact us to confirm preparation time before ordering.</p>}<p>Delivery timing depends on your location. <Link href="/shipping">Read our shipping policy</Link>.</p>{c?.shipping_method&&<p>Shipping method: {c.shipping_method}</p>}</details><details><summary>Customer reviews</summary><p>No verified customer reviews are available yet.</p></details>{c?.faqs?.map((faq,i)=><details key={i}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div><p className={styles.help}>A question before you order? <Link href="/contact">Talk to PostDuty ↗</Link></p></div></div>
    </div>
  </main>;
}
