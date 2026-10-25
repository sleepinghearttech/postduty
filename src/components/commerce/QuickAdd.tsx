'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/components/CartContext';
import { productHref, productStock, type Storefront, type StoreProduct } from './types';
import styles from './commerce.module.css';

/** True when a product can go straight into the bag from a card (no option or required personalisation to choose). */
export function quickAddable(product: StoreProduct): boolean {
  const c = product.commerce;
  return productStock(product) > 0 && !c?.catalog_only && !(c?.variants?.length) && !(c?.personalization?.enabled && c.personalization.required);
}

/** Bag button for a product card. Products that need a choice open their page instead. */
export function QuickAdd({ product, storefront, ordering = true }: { product: StoreProduct; storefront: Storefront; ordering?: boolean }) {
  const { addToCart } = useCart();
  const [added, setAdded] = useState(false);
  if (!ordering || productStock(product) < 1 || product.commerce?.catalog_only) return null;
  if (!quickAddable(product)) {
    return <Link className={styles.quickAdd} href={productHref(product, storefront)} aria-label={`Choose options for ${product.name}`} title="Choose options"><BagIcon /></Link>;
  }
  return <>
    <button type="button" className={styles.quickAdd} data-added={added || undefined} aria-label={`Add ${product.name} to bag`} title="Add to bag"
      onClick={() => { addToCart(product, 1, { storefront }); setAdded(true); window.setTimeout(() => setAdded(false), 1600); }}>
      {added ? <span aria-hidden="true">✓</span> : <BagIcon />}
    </button>
    <span className={styles.srOnly} role="status" aria-live="polite">{added ? `${product.name} added to your bag` : ''}</span>
  </>;
}

function BagIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
}
