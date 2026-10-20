import styles from './commerce.module.css';

/** Seasonal decoration for the store page. Purely presentational, CSS-animated and hidden from assistive tech. */

// Fixed positions keep server and client markup identical (no Math.random during render).
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

export function Ornament({ second = false }: { second?: boolean }) {
  const fill = second ? '#c8a15a' : '#9e1b32';
  return (
    <svg className={`${styles.ornament} ${second ? styles.ornamentTwo : ''}`} viewBox="0 0 44 120" aria-hidden="true">
      <line x1="22" y1="0" x2="22" y2="64" stroke="#c8a15a" strokeWidth="1.2" />
      <rect x="17" y="62" width="10" height="8" rx="1.5" fill="#c8a15a" />
      <circle cx="22" cy="90" r="20" fill={fill} />
      <path d="M6 86c10 6 22 6 32 0" stroke="#fbf6ec" strokeOpacity=".55" strokeWidth="1.4" fill="none" />
      <path d="M8 96c9 5 19 5 28 0" stroke="#fbf6ec" strokeOpacity=".35" strokeWidth="1.2" fill="none" />
      <ellipse cx="15" cy="82" rx="4" ry="6" fill="#fff" fillOpacity=".22" transform="rotate(-25 15 82)" />
    </svg>
  );
}

export function Garland() {
  return (
    <svg className={styles.garland} viewBox="0 0 1200 34" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 4 Q150 34 300 4 T600 4 T900 4 T1200 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {[150, 450, 750, 1050].map(x => <circle key={x} cx={x} cy="19" r="5" fill="#9e1b32" />)}
      {[300, 600, 900].map(x => <circle key={x} cx={x} cy="6" r="3.5" fill="#c8a15a" />)}
    </svg>
  );
}

export function FestiveBar() {
  return (
    <div className={styles.festiveBar}>
      <span>Christmas by PostDuty</span><i>✦</i>
      <span>Delivering across <b>Karnataka</b></span><i>✦</i>
      <span>Same-day in Bengaluru</span>
    </div>
  );
}

const TRUST = [
  { title: 'Handmade by medicos', text: 'Every piece is made in small batches by healthcare professionals.', icon: <path d="M12 21s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12C19 16.6 12 21 12 21Z" /> },
  { title: 'Delivered with care', text: 'Standard delivery across Karnataka, same-day in Bengaluru.', icon: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /> },
  { title: 'Secure payments', text: 'UPI, cards and net banking through Razorpay.', icon: <path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5z" /> },
  { title: 'Fair returns', text: 'Damaged or wrong item? Replacement or full refund.', icon: <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" /> },
];

export function TrustStrip() {
  return (
    <div className={styles.trustWrap}>
      <div className={styles.trustStrip}>
        {TRUST.map(item => (
          <div key={item.title}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
            <p><strong>{item.title}</strong><span>{item.text}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
