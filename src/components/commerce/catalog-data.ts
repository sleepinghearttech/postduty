import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import type { StoreProduct, Storefront } from './types';
import { PUBLIC_CREATOR_COLUMNS, type PublicCreatorProfile } from '@/lib/creator-profile';

export function belongsToStore(product:StoreProduct, storefront:Storefront) {
  return !product.commerce?.archived && (product.commerce?.storefronts ?? ['general']).includes(storefront);
}
export async function getStoreProducts(storefront:Storefront):Promise<{products:StoreProduct[];unavailable:boolean}> {
  noStore();
  const { data,error } = await supabase.from(commerceTable('products'))
    .select('id,name,slug,description,price,image_url,stock,is_active,created_at,commerce,creator_id')
    .eq('is_active',true).order('created_at',{ascending:false});
  if(error) return {products:[],unavailable:true};
  return {products:((data??[]) as StoreProduct[]).filter(p=>belongsToStore(p,storefront)),unavailable:false};
}
export async function getStoreProduct(slug:string,storefront:Storefront):Promise<StoreProduct|null> {
  noStore();
  const {data,error}=await supabase.from(commerceTable('products'))
    .select('id,name,slug,description,price,image_url,stock,is_active,created_at,commerce,creator_id')
    .eq('slug',slug).eq('is_active',true).maybeSingle();
  if(error||!data||!belongsToStore(data as StoreProduct,storefront)) return null;
  return data as StoreProduct;
}
/**
 * Public creator profile for a product page. Uses the anon client: the database column grant and policy
 * expose only owner-published profiles of active creators, and only these columns.
 */
export async function getCreatorProfile(creatorId:string):Promise<PublicCreatorProfile|null> {
  noStore();
  const {data,error}=await supabase.from(commerceTable('creators')).select(PUBLIC_CREATOR_COLUMNS).eq('id',creatorId).maybeSingle();
  if(error||!data) return null;
  return data as PublicCreatorProfile;
}
