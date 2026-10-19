import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import type { StoreProduct, Storefront } from './types';
import { STOREFRONT_CREATOR_COLUMNS, type StorefrontCreatorProfile } from '@/lib/creator-profile';
import { comboAvailability } from '@/lib/checkout-contract';

export function belongsToStore(product:StoreProduct, storefront:Storefront) {
  return !product.commerce?.archived && (product.commerce?.storefronts ?? ['general']).includes(storefront);
}
export async function getStoreProducts(storefront:Storefront):Promise<{products:StoreProduct[];unavailable:boolean}> {
  noStore();
  const { data,error } = await supabase.from(commerceTable('products'))
    .select('id,name,slug,description,price,image_url,stock,is_active,created_at,commerce,creator_id')
    .eq('is_active',true).order('created_at',{ascending:false});
  if(error) return {products:[],unavailable:true};
  return {products:await withComboAvailability(((data??[]) as StoreProduct[]).filter(p=>belongsToStore(p,storefront))),unavailable:false};
}
export async function getStoreProduct(slug:string,storefront:Storefront):Promise<StoreProduct|null> {
  noStore();
  const {data,error}=await supabase.from(commerceTable('products'))
    .select('id,name,slug,description,price,image_url,stock,is_active,created_at,commerce,creator_id')
    .eq('slug',slug).eq('is_active',true).maybeSingle();
  if(error||!data||!belongsToStore(data as StoreProduct,storefront)) return null;
  return (await withComboAvailability([data as StoreProduct]))[0];
}
/**
 * Public creator profile for a product page. Uses the anon client: the database column grant and policy
 * expose only owner-published profiles of active creators, and only these columns.
 */
export async function getCreatorProfile(creatorId:string):Promise<StorefrontCreatorProfile|null> {
  noStore();
  const {data,error}=await supabase.from(commerceTable('creators')).select(STOREFRONT_CREATOR_COLUMNS).eq('id',creatorId).maybeSingle();
  if(error||!data) return null;
  return data as StorefrontCreatorProfile;
}
/**
 * A combo's displayed stock is derived from its components (stock ÷ quantity per combo, the scarcest wins).
 * Only published components are readable here; an unpublished component makes the combo unavailable.
 */
export async function withComboAvailability(products:StoreProduct[]):Promise<StoreProduct[]> {
  const ids=[...new Set(products.flatMap(p=>p.commerce?.combo?.components?.map(c=>c.product_id)??[]))];
  if(!ids.length) return products;
  const {data,error}=await supabase.from(commerceTable('products')).select('id,stock').in('id',ids).eq('is_active',true);
  const stock=new Map<string,number>(error?[]:(data??[]).map(row=>[row.id as string,row.stock as number]));
  return products.map(p=>p.commerce?.combo?.components?.length?{...p,stock:comboAvailability(p.commerce.combo.components,stock)}:p);
}
