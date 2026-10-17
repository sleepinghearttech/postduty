'use client';
/* eslint-disable @next/next/no-img-element -- Owner-supplied product media is served as-is from public storage. */
import { useRef, useState } from 'react';
import { productMedia, type StoreProduct } from './types';
import { MediaCarousel } from './MediaCarousel';
import styles from './commerce.module.css';
import carousel from './carousel.module.css';

/**
 * Every media item in owner order, primary photo first, videos included. Swipe (with dots) on phones;
 * thumbnails on wider screens scroll the same strip.
 */
export default function ProductGallery({ product }: { product: StoreProduct }) {
  const media = productMedia(product);
  const [selected, setSelected] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const current = media[selected];
  const show = (index: number) => {
    setSelected(index);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: index * track.clientWidth });
  };
  return <div className={styles.gallery}>
    <div className={carousel.galleryTrack}>
      {media.length ? <MediaCarousel media={media} label={`${product.name} media`} contain priority trackRef={trackRef} onIndexChange={setSelected} /> : <div className={styles.photoPlaceholder}>Photo coming soon</div>}
    </div>
    {current?.attribution && <p className={styles.attribution}>{current.attribution}</p>}
    {media.length > 1 && <div className={`${styles.thumbnails} ${carousel.thumbs}`} aria-label="Product media">{media.map((m, i) => <button key={`${m.url}-${i}`} type="button" aria-label={`View ${m.type === 'video' ? 'video' : 'photo'} ${i + 1} of ${media.length}`} aria-pressed={selected === i} onClick={() => show(i)}>{m.type === 'image' ? <img src={m.url} alt="" loading="lazy" /> : <span>▶ Video</span>}</button>)}</div>}
  </div>;
}
