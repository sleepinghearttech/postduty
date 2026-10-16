import type { Metadata } from 'next';
import Link from 'next/link';
import Catalog from '@/components/commerce/Catalog';
import { getStoreProducts } from '@/components/commerce/catalog-data';
import { money,primaryImage,productHref,productPrice } from '@/components/commerce/types';
import { isCommerceSandbox } from '@/lib/commerce-db';
import styles from '@/components/commerce/commerce.module.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'The PostDuty Store | Healthcare, handmade & everyday gifts',description:'Thoughtful healthcare gifts, handmade objects, crochet and 3D-printed pieces. Explore the curated PostDuty Store.'};
export default async function StorePage(){
  const {products,unavailable}=await getStoreProducts('general');
  const hero=products.find(p=>p.commerce?.featured)??products[0];
  const image=hero&&primaryImage(hero);
  return <main className={styles.storePage}>
    {isCommerceSandbox()&&<div className={styles.previewNotice}>Private commerce preview · Fictional products and test payments only</div>}
    <div className={styles.storeNav}><Link href="/store" aria-current="page">The PostDuty Store</Link><div><Link href="/christmas">The Christmas edit ↗</Link><Link href="/admin">Owner access</Link></div></div>
    <section className={styles.generalHero}><div className={styles.heroCopy}><p className={styles.eyebrow}>A considered collection, by PostDuty</p><h1>Small objects.<br/><em>Real meaning.</em></h1><p>For the people who care. For the homes we make. Thoughtful healthcare gifts, handmade pieces and useful everyday objects, brought together.</p><a href="#products" className={styles.primaryLink}>Find your next favourite <span aria-hidden="true">↗</span></a><div className={styles.heroLabels}><span>Healthcare &amp; care</span><span>Handmade &amp; personal</span><span>Everyday &amp; useful</span></div></div><div className={styles.generalHeroVisual}><div className={styles.heroImage}>{image?<img src={image} alt={hero.name} fetchPriority="high"/>:<div className={styles.editorialPlaceholder}><span>PostDuty</span><p>Objects with purpose.<br/>Made for your everyday.</p></div>}</div>{hero&&<Link className={styles.heroCaption} href={productHref(hero,'general')}><span><small>From our collection</small><strong>{hero.name}</strong></span><span>{hero.commerce?.variants?.length?'From ':''}{money(productPrice(hero))} ↗</span></Link>}<span className={styles.verticalNote}>THE POSTDUTY EDIT</span></div></section>
    <section id="products" className={styles.collectionSection}><div className={styles.collectionHeading}><div><p className={styles.eyebrow}>Objects with a story</p><h2>Find something that feels like you.</h2></div><p>Healthcare meets handmade.<br/>A collection with room for both.</p></div><Catalog products={products} storefront="general" unavailable={unavailable}/></section>
    <section className={styles.closing}><p className={styles.eyebrow}>A little seasonal wonder</p><h2>Christmas, with a personal touch.</h2><p>Explore the festive PostDuty collection for your home and your people.</p><Link href="/christmas">Discover Christmas by PostDuty ↗</Link></section>
  </main>;
}
