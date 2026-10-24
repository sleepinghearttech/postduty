'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useCart} from '@/components/CartContext';
import {money,type StoreProduct,type Storefront} from '@/components/commerce/types';
import styles from '@/components/commerce/commerce.module.css';
// Shared with the existing cart payment flow.
declare global {interface Window {Razorpay:new(options:RazorpayOptions)=>{open():void};}}
type RazorpayOptions={key:string;amount:number;currency:string;name:string;description:string;order_id:string;prefill?:{name?:string;email?:string;contact?:string};theme?:{color?:string};handler:(response:{razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string})=>void;modal?:{ondismiss?:()=>void}};
export default function CheckoutForm({product,storefront='general',catalogOnly=false}:{product:StoreProduct;storefront?:Storefront;catalogOnly?:boolean}){
  const router=useRouter();const {addToCart}=useCart();const variants=product.commerce?.variants??[];
  const [variantId,setVariantId]=useState(variants[0]?.id??'');const [personalization,setPersonalization]=useState('');const [quantity,setQuantity]=useState(1);const [message,setMessage]=useState('');
  const variant=variants.find(v=>v.id===variantId);const price=variant?.price??product.price;const stock=variant?.stock??product.stock;const personal=product.commerce?.personalization;
  const valid=stock>0&&(!personal?.enabled||!personal.required||!!personalization.trim());
  function add(checkout:boolean){if(!valid)return;addToCart(product,quantity,{variantId:variant?.id,personalization:personal?.enabled?personalization.trim():undefined,storefront});if(checkout)router.push(`/cart?storefront=${storefront}`);else setMessage('Added to your bag.');}
  if(catalogOnly) return <div className={styles.purchase}><div className={styles.productPrice}><strong>{money(price)}</strong><span>{(product.stock??0)>0?(product.commerce?.made_to_order?'Made to order':'Catalogue preview'):'Out of stock'}</span></div><p className={styles.purchaseNote}>Ordering opens soon. Browse the designs and details here.</p></div>;
  const pack=product.commerce?.pack;
  return <div className={styles.purchase}><div className={styles.productPrice}><strong>{money(price)}</strong><span>{stock>0?(product.commerce?.made_to_order?'Made to order':'Available'):'Currently unavailable'}</span></div>
    {pack&&<p className={styles.purchaseNote}>Pack of {pack.size}: {money(pack.price)} for any {pack.size} clips (that&apos;s {money(Math.round(pack.price/pack.size))} each), delivered free. Mix any designs; the pack price is applied automatically in your bag.</p>}
    {variants.length>0&&<fieldset className={styles.variants}><legend>Choose your option</legend><div>{variants.map(v=><button key={v.id} type="button" aria-pressed={variantId===v.id} onClick={()=>{setVariantId(v.id);setQuantity(1);setMessage('');}}>{v.name}{v.stock<1?' · unavailable':''}</button>)}</div></fieldset>}
    {personal?.enabled&&<label className={styles.personalization}>{personal.label||'Personalise your piece'} {personal.required?'*':'(optional)'}<input type="text" value={personalization} maxLength={personal.max_length||100} required={personal.required} onChange={e=>{setPersonalization(e.target.value);setMessage('');}} placeholder="Enter your text"/><small>{personalization.length}/{personal.max_length||100} characters · Please check spelling carefully.</small></label>}
    {stock>0&&<label className={styles.quantityLabel}>Quantity<select value={quantity} onChange={e=>setQuantity(Number(e.target.value))}>{Array.from({length:Math.min(stock,20)},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label>}
    <div className={styles.purchaseActions}><button type="button" disabled={!valid} onClick={()=>add(false)}>Add to bag <span aria-hidden="true">+</span></button><button type="button" disabled={!valid} onClick={()=>add(true)}>Buy now ↗</button></div>
    {!valid&&stock>0&&personal?.required&&<p className={styles.purchaseNote}>Add your personalisation to continue.</p>}<p className={styles.cartFeedback} role="status">{message}{message&&<> <a href={`/cart?storefront=${storefront}`}>View bag →</a></>}</p>
  </div>;
}
