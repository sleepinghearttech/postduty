import type { Metadata } from 'next';
import Link from 'next/link';
import Catalog from '@/components/commerce/Catalog';
import { getStoreProducts } from '@/components/commerce/catalog-data';
import { money,primaryImage,productHref,productPrice } from '@/components/commerce/types';
import { isCommerceSandbox } from '@/lib/commerce-db';
import styles from './christmas.module.css';
import commerce from '@/components/commerce/commerce.module.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Christmas by PostDuty | Thoughtful festive gifts',description:'Discover Christmas ornaments, handmade decorations and personal gifts in the seasonal PostDuty collection.'};

export default async function ChristmasPage() {
  const {products,unavailable}=await getStoreProducts('christmas');
  const hero=products.find(p=>p.commerce?.featured)??products[0];
  const heroImage=hero&&primaryImage(hero);
  return <main className={styles.page}>
    {isCommerceSandbox()&&<div className={commerce.previewNotice}>Private commerce preview · Fictional products and test payments only</div>}
    <div className={commerce.storeNav}><Link href="/christmas" aria-current="page">Christmas by PostDuty</Link><div><Link href="/store">The year-round store ↗</Link><Link href="/admin">Owner access</Link></div></div>
    <section className={styles.shopHero}>
      <div className={styles.shopHeroCopy}>
        <p className={styles.kicker}>Christmas by PostDuty · The festive edit</p>
        <h1>A little wonder.<span> A gift to keep.</span></h1>
        <p>Personal touches. Handmade details. Objects that bring a little more warmth to the season.</p>
        <div className={styles.shopHeroActions}><a href="#shop" className={styles.primaryCta}>Explore the collection <span aria-hidden="true">↗</span></a><Link href="/store" className={styles.secondaryCta}>Gifts for every season</Link></div>
        <p className={commerce.heroFootnote}>Ornaments · Personalised gifts · Festive home</p>
      </div>
      <div className={styles.heroProductPanel}>
        <div className={styles.heroProductImage}>{heroImage?<img src={heroImage} alt={hero.name}/>:<div className={styles.heroProductPlaceholder} aria-hidden="true">✦</div>}<span>{hero?'From the collection':'The festive collection'}</span></div>
        <div className={styles.heroProductMeta}><p>Small details, lasting memories</p><h2>{hero?.name||'Something special is taking shape.'}</h2><span>{hero?.commerce?.short_description||'Thoughtfully selected pieces for your home and the people you love.'}</span>{hero&&<div><strong>{hero.commerce?.variants?.length?'From ':''}{money(productPrice(hero))}</strong><Link href={productHref(hero,'christmas')}>Discover this piece ↗</Link></div>}</div>
      </div>
    </section>
    <div className={commerce.seasonRibbon}><span>For the tree</span><span aria-hidden="true">✦</span><span>For the home</span><span aria-hidden="true">✦</span><span>For someone special</span></div>
    <section id="shop" className={commerce.collectionSection}><div className={commerce.collectionHeading}><div><p className={commerce.eyebrow}>The Christmas collection</p><h2>Make room for a little magic.</h2></div><p>A festive edit of decorations and gifts.<br/>Explore the details that make each piece yours.</p></div><Catalog products={products} storefront="christmas" unavailable={unavailable}/></section>
    <section className={`${commerce.closing} ${commerce.christmasClosing}`}><p className={commerce.eyebrow}>Beyond December</p><h2>Good things, all year long.</h2><p>Healthcare gifts, handmade pieces and everyday objects from PostDuty.</p><Link href="/store">Explore the PostDuty Store ↗</Link></section>
  </main>;
}
