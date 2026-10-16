'use client';
import { useMemo,useState,useEffect } from 'react';
import Link from 'next/link';
import { money,primaryImage,productHref,productStock,productPrice,type Storefront,type StoreProduct } from './types';
import styles from './commerce.module.css';

export default function Catalog({products,storefront,unavailable=false}:{products:StoreProduct[];storefront:Storefront;unavailable?:boolean}) {
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('All');
  const [collection,setCollection]=useState('All');
  const [sort,setSort]=useState('curated');
  const [availableOnly,setAvailableOnly]=useState(false);
  const [savedOnly,setSavedOnly]=useState(false);
  const [favorites,setFavorites]=useState<string[]>([]);
  const [favoriteReady,setFavoriteReady]=useState(false);
  useEffect(()=>{queueMicrotask(()=>{try { const saved=JSON.parse(localStorage.getItem('postduty_favorites')||'[]');if(Array.isArray(saved))setFavorites(saved.filter(v=>typeof v==='string'));}catch{}setFavoriteReady(true);});},[]);
  const categories=useMemo(()=>['All',...new Set(products.map(p=>p.commerce?.category).filter((c):c is string=>!!c))],[products]);
  const collections=useMemo(()=>['All',...new Set(products.flatMap(p=>p.commerce?.collections??[]))],[products]);
  const visible=useMemo(()=>products.filter(p=>{
    const c=p.commerce;
    return (category==='All'||c?.category===category)&&(collection==='All'||c?.collections?.includes(collection))&&(!availableOnly||productStock(p)>0)&&(!savedOnly||favorites.includes(p.id))&&(!query.trim()||[p.name,p.description,c?.category,c?.materials,...(c?.tags??[])].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  }).sort((a,b)=>sort==='low'?productPrice(a)-productPrice(b):sort==='high'?productPrice(b)-productPrice(a):sort==='name'?a.name.localeCompare(b.name):sort==='newest'?b.created_at.localeCompare(a.created_at):Number(!!b.commerce?.featured)-Number(!!a.commerce?.featured)),[products,category,collection,availableOnly,savedOnly,favorites,query,sort]);
  function toggleFavorite(id:string) {const next=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];setFavorites(next);try{localStorage.setItem('postduty_favorites',JSON.stringify(next));}catch{}}
  return <div className={styles.catalog}>
    <div className={styles.toolbar} data-storefront-part="catalog-toolbar">
      <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" placeholder="Search the collection" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search products"/></label>
      <label className={styles.selectLabel}><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c==='All'?'All categories':c}</option>)}</select></label>
      <label className={styles.selectLabel}><span>Sort</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="curated">Featured first</option><option value="newest">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name: A–Z</option></select></label>
    </div>
    <div className={styles.filterRow} data-storefront-part="catalog-filters">
      <div className={styles.chips} aria-label="Collections">{collections.map(c=><button key={c} type="button" aria-pressed={collection===c} onClick={()=>setCollection(c)} className={collection===c?styles.chipActive:styles.chip}>{c==='All'?'Everything':c}</button>)}</div>
      <div className={styles.filterOptions}><label><input type="checkbox" checked={availableOnly} onChange={e=>setAvailableOnly(e.target.checked)}/> Available</label><button type="button" aria-pressed={savedOnly} onClick={()=>setSavedOnly(!savedOnly)} className={styles.savedFilter}>♡ {savedOnly?'All products':'Saved'}</button></div>
    </div>
    <p className={styles.resultCount} data-storefront-part="result-count" aria-live="polite">{visible.length} {visible.length===1?'piece':'pieces'}{savedOnly?' saved on this device':''}</p>
    {unavailable?<div className={styles.empty}><h3>The collection is temporarily unavailable.</h3><p>Please refresh in a moment, or contact us if the problem continues.</p><Link href="/contact">Contact PostDuty →</Link></div>:visible.length===0?<div className={styles.empty}><span aria-hidden="true">✦</span><h3>{products.length?'No pieces match these filters.':'A collection worth waiting for.'}</h3><p>{products.length?'Try another search or browse the full collection.':'Our next collection will appear here when it is ready to order.'}</p>{products.length>0&&<button type="button" onClick={()=>{setQuery('');setCategory('All');setCollection('All');setAvailableOnly(false);setSavedOnly(false);}}>Clear filters</button>}</div>:<div className={styles.grid} data-storefront-part="product-grid">{visible.map(p=>{
      const variants=p.commerce?.variants??[];const minPrice=variants.length?Math.min(...variants.map(v=>v.price)):p.price;const photo=primaryImage(p);
      return <article key={p.id} className={styles.card}>
        <Link href={productHref(p,storefront)} className={styles.productImage} data-storefront-part="product-image">{photo?<img src={photo} alt={p.commerce?.media?.find(m=>m.url===photo)?.alt||p.name} loading="lazy"/>:<span className={styles.photoPlaceholder}>Photo coming soon</span>}{p.commerce?.featured&&<span className={styles.badge}>In the edit</span>}</Link>
        <button className={styles.favorite} data-storefront-part="favorite" type="button" disabled={!favoriteReady} aria-pressed={favorites.includes(p.id)} aria-label={`${favorites.includes(p.id)?'Remove':'Save'} ${p.name}${favorites.includes(p.id)?' from':' to'} favorites`} onClick={()=>toggleFavorite(p.id)}>{favorites.includes(p.id)?'♥':'♡'}</button>
        <div className={styles.cardMeta} data-storefront-part="product-meta"><p>{p.commerce?.category||'PostDuty collection'}</p><h3><Link href={productHref(p,storefront)}>{p.name}</Link></h3><div className={styles.priceRow}><span>{variants.length>1&&new Set(variants.map(v=>v.price)).size>1?'From ':''}{money(minPrice)}</span><span className={styles.stock} data-storefront-part="stock-label">{productStock(p)>0?(p.commerce?.made_to_order?'Made to order':'Available'):'Unavailable'}</span></div></div>
      </article>;
    })}</div>}
  </div>;
}
