'use client';
/* eslint-disable @next/next/no-img-element -- Owner-approved creator photos are external HTTPS images. */
import { useState } from 'react';
import Link from 'next/link';
import { money, primaryImage, productHref, productPrice, type Storefront, type StoreProduct } from './types';
import { QuickAdd } from './QuickAdd';
import styles from './commerce.module.css';

/** "View similar" toggle plus the similar-products shelf. Products are chosen on the server. */
export default function SimilarProducts({ products, storefront, ordering }: { products: StoreProduct[]; storefront: Storefront; ordering: boolean }) {
  const [open, setOpen] = useState(false);
  if (!products.length) return null;
  return <section id="similar" className={styles.similar} aria-labelledby="similar-heading">
    <div className={styles.similarHead}>
      <h2 id="similar-heading">You might also like</h2>
      <button type="button" className={styles.similarToggle} aria-expanded={open} aria-controls="similar-grid" onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        {open ? 'Show fewer' : `View all ${products.length} similar`}
      </button>
    </div>
    <div id="similar-grid" className={styles.similarGrid}>
      {(open ? products : products.slice(0, 4)).map(p => {
        const photo = primaryImage(p);
        return <article key={p.id} className={styles.similarCard}>
          <div className={styles.similarImage}>
            <Link href={productHref(p, storefront)} aria-label={p.name}>{photo ? <img src={photo} alt={p.name} loading="lazy" /> : <span className={styles.photoPlaceholder}>Photo coming soon</span>}</Link>
            <QuickAdd product={p} storefront={storefront} ordering={ordering} />
          </div>
          <h3><Link href={productHref(p, storefront)}>{p.name}</Link></h3>
          <p>{money(productPrice(p))}</p>
        </article>;
      })}
    </div>
  </section>;
}

/** A small anchor near the purchase buttons that jumps to the shelf. */
export function ViewSimilarLink({ count }: { count: number }) {
  if (!count) return null;
  return <a href="#similar" className={styles.viewSimilar} onClick={() => document.querySelector<HTMLButtonElement>('#similar [aria-expanded="false"]')?.click()}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    View similar ({count})
  </a>;
}
