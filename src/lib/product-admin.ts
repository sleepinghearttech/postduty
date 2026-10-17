import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { ProductValidationError, isRecord, validateProductInput, validateOperations, validatePublication } from '@/lib/product-validation';
import type { OwnerProduct, Product } from '@/lib/types';

export async function loadOwnerProduct(id: string): Promise<OwnerProduct | null> {
  const [productResult, operationsResult] = await Promise.all([
    supabaseAdmin.from(commerceTable('products')).select('*').eq('id',id).maybeSingle(),
    supabaseAdmin.from(commerceTable('product_operations')).select('details').eq('product_id',id).maybeSingle(),
  ]);
  if (productResult.error || operationsResult.error) throw new Error('Product records are unavailable.');
  if (!productResult.data) return null;
  return { ...productResult.data as Product, operations: operationsResult.data?.details ?? {} };
}

export async function saveOwnerProduct(input: unknown, mode: 'create'|'update'): Promise<OwnerProduct> {
  if (!isRecord(input)) throw new ProductValidationError('Product information must be an object.');
  const id = input.id;
  if (mode === 'update' && (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new ProductValidationError('A valid product identifier is required.');
  const existing = mode === 'update' ? await loadOwnerProduct(String(id)) : null;
  if (mode === 'update' && !existing) throw new ProductValidationError('Product not found.');
  const actions = ['save','publish','unpublish','archive','duplicate'];
  const action = mode === 'create' ? 'create' : String(input.action ?? 'save');
  if (mode === 'update' && !actions.includes(action)) throw new ProductValidationError('Unknown product action.');
  if (existing && input.updated_at !== undefined && input.updated_at !== existing.updated_at && action !== 'duplicate') throw new ProductValidationError('This product changed since it was opened. Reload before saving.');
  const updates = validateProductInput(input,existing ?? undefined);
  const product: OwnerProduct = {
    id: existing?.id ?? randomUUID(), name: '', slug: '', price: 0, stock: 0, is_active: false,
    description: null, image_url: null, customisation_note: null, created_at: new Date().toISOString(),
    commerce: { storefronts: ['general'] }, creator_id: null, ...existing, ...updates,
    operations: input.operations === undefined ? existing?.operations ?? {} : validateOperations(input.operations),
  };
  if (!product.slug) {
    const base = product.name.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/[\s-]+/g,'-').slice(0,130).replace(/-$/,'') || 'product';
    product.slug = `${base}-${randomUUID().slice(0,8)}`;
  }
  if (!product.image_url) product.image_url = product.commerce?.media?.find(item => item.type === 'image')?.url ?? null;
  if (action === 'create') product.is_active = false;
  if (action === 'publish') product.is_active = true;
  if (action === 'unpublish' || action === 'archive') product.is_active = false;
  if (action === 'archive') product.commerce = { ...product.commerce, archived: true };
  if (action === 'duplicate') {
    product.id = randomUUID(); product.name = `${product.name.slice(0,193)} (copy)`;
    product.slug = `${product.slug.slice(0,140)}-${randomUUID().slice(0,8)}`;
    product.is_active = false; product.stock = 0;
    product.commerce = { ...product.commerce, archived: false, variants: product.commerce?.variants?.map(v => ({ ...v, stock: 0 })) };
  }
  if (product.commerce?.combo?.components?.length) await validateComboComponents(product);
  if (product.is_active) validatePublication(product);
  const { operations, created_at: _createdAt, updated_at: _updatedAt, ...record } = product;
  void _createdAt; void _updatedAt;
  const { data, error } = await supabaseAdmin.rpc(commerceTable('save_commerce_product'), {
    p_product: record,
    p_operations: operations ?? {},
    p_action: action,
    p_expected_updated_at: action === 'duplicate' ? null : existing?.updated_at ?? null,
  });
  if (error) {
    if (error.code === '23505') throw new ProductValidationError('That product URL is already in use. Choose another URL.');
    if (error.message?.includes('changed since')) throw new ProductValidationError('This product changed since it was opened. Reload before saving.');
    throw new Error('The product could not be saved. Please retry.');
  }
  return data as OwnerProduct;
}

/** Components must exist, must not be combos themselves, must not be the combo, and must not have options. */
async function validateComboComponents(product: OwnerProduct): Promise<void> {
  const components = product.commerce!.combo!.components;
  if (product.commerce?.variants?.length) throw new ProductValidationError('A combo cannot have its own options. Remove the options or the combo components.');
  if (components.some(c => c.product_id === product.id)) throw new ProductValidationError('A combo cannot contain itself.');
  const { data, error } = await supabaseAdmin.from(commerceTable('products')).select('id,name,commerce').in('id', components.map(c => c.product_id));
  if (error) throw new Error('Products are unavailable.');
  const found = new Map((data ?? []).map(row => [row.id as string, row as { name: string; commerce: Product['commerce'] }]));
  for (const component of components) {
    const row = found.get(component.product_id);
    if (!row) throw new ProductValidationError('A combo component no longer exists. Choose it again.');
    if (row.commerce?.combo?.components?.length) throw new ProductValidationError(`${row.name} is itself a combo; combos cannot be nested.`);
    if (row.commerce?.variants?.length) throw new ProductValidationError(`${row.name} has options; choose a product without options for a combo.`);
    // A combo can only be offered on a storefront where every component is also offered.
    const missing = (product.commerce?.storefronts ?? ['general']).filter(store => !(row.commerce?.storefronts ?? ['general']).includes(store));
    if (missing.length) throw new ProductValidationError(`${row.name} is not assigned to the ${missing.join(' and ')} storefront. Add it there or remove that storefront from the combo.`);
  }
}
