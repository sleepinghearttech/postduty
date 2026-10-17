// Test listings that must never be merchandised on the public store.
// Reversible: remove a slug here once that listing is unpublished in the database.
export const HIDDEN_PRODUCT_SLUGS: readonly string[] = ["test-xyz"];

export function isHiddenProduct(slug: string | null | undefined): boolean {
  return !!slug && HIDDEN_PRODUCT_SLUGS.includes(slug);
}

// Columns the public storefront reads. Listed explicitly (not "*") so public
// reads keep working once the commerce migration narrows anon access to these
// columns.
export const PUBLIC_PRODUCT_COLUMNS = "id,name,slug,description,price,image_url,stock,is_active,created_at";
