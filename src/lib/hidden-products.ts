// Test listings that must never be merchandised on the public store.
// Reversible: remove a slug here once that listing is unpublished in the database.
export const HIDDEN_PRODUCT_SLUGS: readonly string[] = ["test-xyz"];

export function isHiddenProduct(slug: string | null | undefined): boolean {
  return !!slug && HIDDEN_PRODUCT_SLUGS.includes(slug);
}
