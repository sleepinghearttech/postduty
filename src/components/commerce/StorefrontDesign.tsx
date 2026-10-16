import Link from 'next/link';
import styles from './refinement.module.css';

export type StorefrontDesign = 'classic' | 'refined';

/** This visual experiment is confined to the test preview until owner acceptance. */
export function storefrontDesign(sandbox: boolean, requested?: string | string[]): StorefrontDesign {
  return sandbox && requested !== 'classic' ? 'refined' : 'classic';
}

export function StorefrontDesignSwitch({ path, design }: { path: '/christmas' | '/store'; design: StorefrontDesign }) {
  return <aside className={styles.comparison} aria-label="Storefront design comparison">
    <p>Fictional products · test payments only</p>
    <nav aria-label="Preview appearance">
      <span>Appearance</span>
      <Link href={`${path}?design=refined`} aria-current={design === 'refined' ? 'page' : undefined}>Refined</Link>
      <Link href={`${path}?design=classic`} aria-current={design === 'classic' ? 'page' : undefined}>Original</Link>
    </nav>
  </aside>;
}
