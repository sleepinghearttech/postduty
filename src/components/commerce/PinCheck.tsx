'use client';
import { useEffect, useState } from 'react';
import { money } from './types';
import styles from './commerce.module.css';

/**
 * Delivery availability by PIN code. Mirrors checkout's rules: served PIN prefixes (from the served states),
 * same-day prefixes and the standard/pack delivery prices. Checkout re-validates the full address.
 */
export default function PinCheck({ servedPrefixes, servedLabel, sameDayPrefixes, standardFee, sameDayFee, packSize }: {
  servedPrefixes: string[] | null; servedLabel: string; sameDayPrefixes: string[]; standardFee: number; sameDayFee: number; packSize: number | null;
}) {
  const [pin, setPin] = useState('');
  const [checked, setChecked] = useState<string | null>(null);
  useEffect(() => { queueMicrotask(() => { try { const saved = localStorage.getItem('postduty_pin'); if (saved && /^[1-9]\d{5}$/.test(saved)) { setPin(saved); setChecked(saved); } } catch { /* ignore */ } }); }, []);
  const valid = /^[1-9]\d{5}$/.test(pin);
  function check() { if (!valid) return; setChecked(pin); try { localStorage.setItem('postduty_pin', pin); } catch { /* ignore */ } }
  const serves = checked && (!servedPrefixes || servedPrefixes.some(p => checked.startsWith(p)));
  const sameDay = checked && serves && sameDayPrefixes.some(p => checked.startsWith(p));
  return <div className={styles.pinCheck}>
    <label htmlFor="pin-check">Check delivery to your PIN code</label>
    <div className={styles.pinRow}>
      <input id="pin-check" inputMode="numeric" maxLength={6} pattern="[1-9][0-9]{5}" placeholder="e.g. 560054" value={pin}
        onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setChecked(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); check(); } }} />
      <button type="button" onClick={check} disabled={!valid}>Check</button>
    </div>
    <div role="status" aria-live="polite">
      {checked && serves && <ul className={styles.pinResult}>
        <li><strong>✓ Delivers to {checked}.</strong> Standard delivery: dispatched within 3 working days, then usually 2–5 working days. {money(standardFee)}{packSize ? `, free with a pack of ${packSize}` : ''}.</li>
        {sameDay && <li><strong>Same-day delivery available</strong> in Bengaluru for {money(sameDayFee)}. Order before 2 PM on a working day.</li>}
      </ul>}
      {checked && !serves && <p className={styles.pinNo}>Sorry, we don&apos;t deliver to {checked} yet. We currently deliver within {servedLabel}.</p>}
    </div>
  </div>;
}
