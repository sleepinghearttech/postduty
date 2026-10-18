/**
 * Catalogue-only mode blocks ordering. Exactly "true" (surrounding whitespace ignored) enables it;
 * any other value, or no value, leaves ordering open. Dependency-free so middleware and routes share it.
 */
export function isCatalogOnly(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMMERCE_CATALOG_ONLY?.trim() === 'true';
}
