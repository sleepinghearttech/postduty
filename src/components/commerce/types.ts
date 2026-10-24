import type { Product } from '@/lib/types';
export type Storefront = 'general' | 'christmas';
export type StoreProduct = Product & {
  creator_id?: string | null;
  commerce?: {
    sku?: string; category?: string; storefronts?: Storefront[]; collections?: string[];
    short_description?: string; materials?: string; tags?: string[];
    media?: {url:string;type:'image'|'video';alt:string;attribution?:string}[];
    variants?: {id:string;name:string;sku?:string;price:number;stock:number}[];
    pack?: {group:string;size:number;price:number} | null;
    personalization?: {enabled:boolean;label:string;max_length:number;required:boolean};
    made_to_order?:boolean; preparation_days?:number; capacity?:number; featured?:boolean; archived?:boolean; catalog_only?:boolean;
    seo_title?:string;seo_description?:string;faqs?:{question:string;answer:string}[];
    dimensions?:string;weight_grams?:number;shipping_method?:string;
    combo?:{components:{product_id:string;quantity:number}[]};
  };
};
export const money = (paise:number) => (paise/100).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
export const productPrice = (product:StoreProduct) => product.commerce?.variants?.length ? Math.min(...product.commerce.variants.map(v=>v.price)) : product.price;
export const productHref = (product:Pick<StoreProduct,'slug'>, storefront:Storefront) => `/products/${encodeURIComponent(product.slug)}?storefront=${storefront}`;
export const productStock = (product:StoreProduct) => product.commerce?.variants?.length ? product.commerce.variants.reduce((sum,v)=>sum+v.stock,0) : product.stock;
export const primaryImage = (product:StoreProduct) => product.image_url || product.commerce?.media?.find(m=>m.type==='image')?.url;
export type MediaItem = {url:string;type:'image'|'video';alt:string;attribution?:string};
/** Every media item of a product, in owner order with the primary photo first and duplicates removed. */
export const productMedia = (product:StoreProduct):MediaItem[] => {
  const media=product.commerce?.media??[];
  const primary=product.image_url?{type:'image' as const,alt:product.name,...media.find(m=>m.url===product.image_url),url:product.image_url}:null;
  const seen=new Set<string>();const all:MediaItem[]=[];
  for(const item of [...(primary?[primary]:[]),...media]){if(!item.url||seen.has(item.url))continue;seen.add(item.url);all.push({...item,alt:item.alt||product.name});}
  return all;
};
