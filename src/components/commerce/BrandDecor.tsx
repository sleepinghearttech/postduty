import type { ReactNode } from 'react';
import styles from './commerce.module.css';

/**
 * Brand decoration for the two storefronts. Purely presentational, CSS-animated, hidden from assistive tech.
 * Christmas store: snow, ornaments, sparkles, garland. PostDuty store: heartbeat line, pulse dot.
 */

// Fixed values keep server and client markup identical (no Math.random during render).
const FLAKES = [
  [4, 9, 0, 5], [11, 13, 3, 4], [19, 11, 6, 6], [27, 15, 1, 3], [35, 10, 8, 5], [43, 14, 4, 4],
  [51, 12, 10, 6], [59, 16, 2, 3], [66, 11, 7, 5], [74, 13, 5, 4], [82, 10, 9, 6], [90, 15, 1, 3], [96, 12, 11, 5],
] as const; // [left %, duration s, delay s, size px]

export function Snowfall() {
  return (
    <div className={styles.snow} aria-hidden="true">
      {FLAKES.map(([left, duration, delay, size], i) => (
        <span key={i} style={{ left: `${left}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `-${delay}s` }} />
      ))}
    </div>
  );
}

const SPARKS = [[8, 30, 0, 14], [30, 12, 1.1, 10], [58, 70, 2.2, 12], [88, 40, .6, 16], [72, 8, 1.7, 9], [16, 78, 2.8, 11]] as const; // [left %, top %, delay s, size px]

export function Sparkles() {
  return (
    <div className={styles.sparkles} aria-hidden="true">
      {SPARKS.map(([left, top, delay, size], i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}>
          <path d="M10 0c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10Z" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

const ORNAMENT_COLOURS = { red: '#a5162f', gold: '#c9a24e', silver: '#b9bfc8' } as const;

export function Ornament({ tone = 'red', position = 'one' }: { tone?: keyof typeof ORNAMENT_COLOURS; position?: 'one' | 'two' | 'three' }) {
  const extra = position === 'two' ? styles.ornamentTwo : position === 'three' ? styles.ornamentThree : '';
  return (
    <svg className={`${styles.ornament} ${extra}`} viewBox="0 0 44 120" aria-hidden="true">
      <line x1="22" y1="0" x2="22" y2="64" stroke="#c9a24e" strokeWidth="1.2" />
      <rect x="17" y="62" width="10" height="8" rx="1.5" fill="#c9a24e" />
      <circle cx="22" cy="90" r="20" fill={ORNAMENT_COLOURS[tone]} />
      <path d="M6 86c10 6 22 6 32 0" stroke="#fffdf9" strokeOpacity=".55" strokeWidth="1.4" fill="none" />
      <path d="M8 96c9 5 19 5 28 0" stroke="#fffdf9" strokeOpacity=".35" strokeWidth="1.2" fill="none" />
      <ellipse cx="15" cy="82" rx="4" ry="6" fill="#fff" fillOpacity=".25" transform="rotate(-25 15 82)" />
    </svg>
  );
}

export function Garland() {
  return (
    <svg className={styles.garland} viewBox="0 0 1200 34" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 6 Q150 32 300 6 Q450 32 600 6 Q750 32 900 6 Q1050 32 1200 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {[150, 450, 750, 1050].map(x => <circle key={x} cx={x} cy="19" r="5" fill="#a5162f" />)}
      {[300, 600, 900].map(x => <circle key={x} cx={x} cy="6" r="3.5" fill="#c9a24e" />)}
    </svg>
  );
}

/** A single calm heartbeat trace that draws itself once. */
export function HeartbeatLine() {
  return (
    <svg className={styles.ecg} viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M0 22H470l14-14 12 26 14-30 12 30 10-12H640l8-6 8 6H1200" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PulseDot() {
  return <span className={styles.pulseDot} aria-hidden="true" />;
}

export function BrandBar({ items }: { items: ReactNode[] }) {
  return (
    <div className={styles.brandBar}>
      {items.map((item, i) => <span key={i}>{i > 0 && <i aria-hidden="true">✦ </i>}{item}</span>)}
    </div>
  );
}

type TrustItem = { title: string; text: string; icon: ReactNode };
const ICONS = {
  truck: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  lock: <path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5z" />,
  undo: <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />,
  pulse: <path d="M2 12h5l2-5 4 10 2-5h7" />,
  gift: <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7S10.5 3 8 3.5 7 7 12 7Zm0 0s1.5-4 4-3.5S17 7 12 7Z" />,
};
const DELIVERY: TrustItem = { title: 'Delivered with care', text: 'Standard delivery across Karnataka, same-day in Bengaluru.', icon: ICONS.truck };
const PAYMENTS: TrustItem = { title: 'Secure payments', text: 'UPI, cards and net banking through Razorpay.', icon: ICONS.lock };
const RETURNS: TrustItem = { title: 'Fair returns', text: 'Damaged or wrong item? Replacement or full refund.', icon: ICONS.undo };

export const STORE_TRUST: TrustItem[] = [
  { title: 'Made by medicos', text: 'Every piece is made in small batches by healthcare professionals.', icon: ICONS.pulse },
  DELIVERY, PAYMENTS, RETURNS,
];
export const CHRISTMAS_TRUST: TrustItem[] = [
  { title: 'Designed in Bengaluru', text: 'Original pieces, printed and finished by hand in small batches.', icon: ICONS.gift },
  DELIVERY, PAYMENTS, RETURNS,
];

export function TrustStrip({ items }: { items: TrustItem[] }) {
  return (
    <div className={styles.trustWrap}>
      <div className={styles.trustStrip}>
        {items.map(item => (
          <div key={item.title}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
            <p><strong>{item.title}</strong><span>{item.text}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
