'use client';
import React,{createContext,useContext,useState,useEffect} from 'react';
import type {StoreProduct,Storefront} from '@/components/commerce/types';
import {trackEvent} from '@/lib/attribution-client';
export type CartSelection={variantId?:string;personalization?:string;storefront?:Storefront};
export type CartItem={product:StoreProduct;quantity:number;lineId:string;storefront:Storefront;variantId?:string;personalization?:string};
export function cartUnitPrice(item:CartItem){return item.product.commerce?.variants?.find(v=>v.id===item.variantId)?.price??item.product.price;}
export function cartStock(item:CartItem){return item.product.commerce?.variants?.find(v=>v.id===item.variantId)?.stock??item.product.stock;}
const keyFor=(productId:string,options:CartSelection)=>JSON.stringify([productId,options.variantId??'',options.personalization??'',options.storefront??'general']);
type CartContextType={cart:CartItem[];addToCart:(product:StoreProduct,quantity?:number,options?:CartSelection)=>void;removeFromCart:(lineId:string)=>void;updateQuantity:(lineId:string,quantity:number)=>void;clearCart:(storefront?:Storefront)=>void;totalItems:number;totalAmount:number};
const CartContext=createContext<CartContextType|undefined>(undefined);
export function CartProvider({children}:{children:React.ReactNode}){
  const [cart,setCart]=useState<CartItem[]>([]);const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(cancelled)return;try{const saved=JSON.parse(localStorage.getItem('postduty_cart')||'[]');if(Array.isArray(saved)){setCart(saved.filter(item=>item&&typeof item.product?.id==='string'&&typeof item.product?.slug==='string'&&Number.isSafeInteger(item.quantity)&&item.quantity>0&&Number.isSafeInteger(item.product.price)&&item.product.price>=0).map(item=>{const options={variantId:typeof item.variantId==='string'?item.variantId:undefined,personalization:typeof item.personalization==='string'?item.personalization:undefined,storefront:item.storefront==='christmas'?'christmas' as const:'general' as const};return{product:item.product,quantity:item.quantity,...options,lineId:keyFor(item.product.id,options)};}));}}catch{}setHydrated(true);});return()=>{cancelled=true;};},[]);
  useEffect(()=>{if(hydrated){try{localStorage.setItem('postduty_cart',JSON.stringify(cart));}catch{}}},[cart,hydrated]);
  function addToCart(product:StoreProduct,quantity=1,options:CartSelection={}){
    const storefront=options.storefront??'general';const lineId=keyFor(product.id,{...options,storefront});const stock=product.commerce?.variants?.find(v=>v.id===options.variantId)?.stock??product.stock;if(stock<1)return;
    trackEvent('add_to_cart',{product_id:product.id,storefront});
    setCart(prev=>{const existing=prev.find(i=>i.lineId===lineId);return existing?prev.map(i=>i.lineId===lineId?{...i,product,quantity:Math.min(i.quantity+quantity,stock)}:i):[...prev,{product,quantity:Math.min(quantity,stock),lineId,storefront,variantId:options.variantId,personalization:options.personalization}];});
  }
  function removeFromCart(lineId:string){setCart(prev=>prev.filter(item=>item.lineId!==lineId));}
  function updateQuantity(lineId:string,quantity:number){if(quantity<=0){removeFromCart(lineId);return;}setCart(prev=>prev.map(item=>item.lineId===lineId?{...item,quantity:Math.min(Math.max(1,quantity),cartStock(item))}:item));}
  function clearCart(storefront?:Storefront){setCart(prev=>storefront?prev.filter(item=>item.storefront!==storefront):[]);}
  const totalItems=cart.reduce((sum,i)=>sum+i.quantity,0);const totalAmount=cart.reduce((sum,i)=>sum+cartUnitPrice(i)*i.quantity,0);
  return <CartContext.Provider value={{cart,addToCart,removeFromCart,updateQuantity,clearCart,totalItems,totalAmount}}>{children}</CartContext.Provider>;
}
export function useCart(){const context=useContext(CartContext);if(!context)throw new Error('useCart must be used within a CartProvider');return context;}
