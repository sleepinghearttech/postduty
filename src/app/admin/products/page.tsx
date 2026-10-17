import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireOwner } from '@/lib/commerce-auth';
import { commerceTable, isCommerceSandbox } from '@/lib/commerce-db';
import type { OwnerProduct, Product } from '@/lib/types';
import { ProductsClient } from './ProductsClient';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  if (!await requireOwner()) redirect('/admin/login');
  const [products, operations] = await Promise.all([
    supabaseAdmin.from(commerceTable('products')).select('*').order('created_at',{ ascending: false }),
    supabaseAdmin.from(commerceTable('product_operations')).select('product_id,details'),
  ]);
  if (products.error || operations.error) return <div className="p-6 text-sm text-red-700">Products could not be loaded. Please refresh or check the commerce database setup.</div>;
  const details = new Map((operations.data ?? []).map(row => [row.product_id,row.details]));
  const result: OwnerProduct[] = ((products.data ?? []) as Product[]).map(product => ({ ...product, operations: details.get(product.id) ?? {} }));
  return <ProductsClient initialProducts={result} sandbox={isCommerceSandbox()} />;
}
