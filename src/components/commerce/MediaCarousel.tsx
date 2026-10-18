'use client';
/* eslint-disable @next/next/no-img-element -- Owner-supplied product media is served as-is from public storage. */
import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { MediaItem } from './types';
import styles from './carousel.module.css';

/** Index of the slide nearest the current scroll position. */
export function slideIndex(scrollLeft: number, width: number, count: number): number {
  if (!width || count < 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / width)));
}

/**
 * Swipeable media strip. Touch swipe uses native scroll-snap; arrow keys move between slides when focused;
 * dots show position. Slides after the first load lazily. The parent sets the size, so nothing shifts.
 */
export function MediaCarousel({ media, label, wrap, contain = false, priority = false, videos = true, className, onIndexChange, trackRef: externalRef }: {
  media: MediaItem[]; label: string; contain?: boolean; priority?: boolean; videos?: boolean; className?: string;
  /** Wraps the scrolling track, e.g. in a product link, so swiping and tapping still open the product. */
  wrap?: (track: ReactNode) => ReactNode;
  onIndexChange?: (index: number) => void; trackRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const trackRef = externalRef ?? ownRef;
  const [active, setActive] = useState(0);
  const items = videos ? media : media.filter(item => item.type === 'image');
  const go = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.min(items.length - 1, Math.max(0, index));
    track.scrollTo({ left: next * track.clientWidth });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (items.length < 2) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); go(active + (event.key === 'ArrowRight' ? 1 : -1)); }
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const index = slideIndex(track.scrollLeft, track.clientWidth, items.length);
    if (index !== active) { setActive(index); onIndexChange?.(index); }
  };
  const track = <div ref={trackRef} className={`${styles.track} ${contain ? styles.contain : ''}`} onScroll={onScroll} onKeyDown={onKeyDown}
    tabIndex={wrap ? undefined : items.length > 1 ? 0 : undefined} role="group" aria-roledescription="carousel" aria-label={`${label} — ${items.length} ${items.length === 1 ? 'item' : 'items'}`}>
    {items.map((item, index) => <div key={`${item.url}-${index}`} className={styles.slide} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${items.length}`}>
      {item.type === 'video'
        ? <video src={item.url} controls playsInline preload="metadata" aria-label={item.alt} />
        : <img src={item.url} alt={item.alt} loading={index === 0 && priority ? 'eager' : 'lazy'} decoding="async" draggable={false} />}
    </div>)}
  </div>;
  return <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }} onKeyDown={wrap ? onKeyDown : undefined}>
    {wrap ? wrap(track) : track}
    {items.length > 1 && <div className={styles.dots}>{items.map((item, index) => <button key={`${item.url}-dot-${index}`} type="button" aria-label={`Show ${item.type === 'video' ? 'video' : 'photo'} ${index + 1} of ${items.length}`} aria-current={active === index} onClick={() => go(index)} />)}</div>}
  </div>;
}
