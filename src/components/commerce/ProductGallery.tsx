'use client';
import {useState} from 'react';
import type {StoreProduct} from './types';
import styles from './commerce.module.css';
export default function ProductGallery({product}:{product:StoreProduct}){
  const media=[...(product.image_url?[{url:product.image_url,type:'image' as const,alt:product.commerce?.media?.find(m=>m.url===product.image_url)?.alt||product.name,attribution:product.commerce?.media?.find(m=>m.url===product.image_url)?.attribution}]:[]),...(product.commerce?.media??[]).filter(m=>m.url!==product.image_url)];
  const [selected,setSelected]=useState(0);const current=media[selected];
  return <div className={styles.gallery}><div className={styles.galleryMain}>{current?.type==='video'?<video key={current.url} src={current.url} controls playsInline preload="metadata" aria-label={current.alt||product.name}/>:current?<img src={current.url} alt={current.alt||product.name}/>:<div className={styles.photoPlaceholder}>Photo coming soon</div>}</div>{current?.attribution&&<p className={styles.attribution}>{current.attribution}</p>}{media.length>1&&<div className={styles.thumbnails} aria-label="Product media">{media.map((m,i)=><button key={`${m.url}-${i}`} type="button" aria-label={`View ${m.type==='video'?'video':'photo'} ${i+1}`} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{m.type==='image'?<img src={m.url} alt=""/>:<span>▶ Video</span>}</button>)}</div>}</div>;
}
