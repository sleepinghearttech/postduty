import { Section } from '@/components/business/BusinessUI';
import { currency } from '@/lib/business/metrics';
import type { AudienceSummary, Row } from '@/lib/business/audience';

function Bars({ rows, money }: { rows: Row[]; money?: boolean }) {
  if (!rows.length) return <p className="text-sm text-stone-500">No data yet for these dates.</p>;
  const max = Math.max(...rows.map(r => r.count), 1);
  return <ul className="space-y-2 text-sm">{rows.map(r => <li key={r.label}>
    <div className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className="shrink-0 text-stone-600">{r.count}{money && r.amount ? ` · ${currency(r.amount)}` : ''}</span></div>
    <div className="mt-1 h-1.5 rounded bg-stone-100"><div className="h-1.5 rounded bg-brand" style={{ width: `${Math.max(4, r.count / max * 100)}%` }} /></div>
  </li>)}</ul>;
}

function Hours({ s, field }: { s: AudienceSummary; field: 'orders' | 'visits' }) {
  const max = Math.max(...s.hours.map(h => h[field]), 1);
  return <><div className="flex h-24 items-end gap-px" aria-label={`${field} by hour of day`}>{s.hours.map(h => <div key={h.hour} className="flex h-full min-w-0 flex-1 items-end" title={`${h.label}: ${h[field]}`}><div className="w-full rounded-t bg-brand" style={{ height: h[field] ? `${Math.max(4, h[field] / max * 100)}%` : '2px', opacity: h[field] ? 1 : .15 }} /></div>)}</div>
    <div className="mt-1 flex justify-between text-[10px] text-stone-500"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div></>;
}

const pct = (v: number | null) => v === null ? '—' : `${v}%`;

export default function AudiencePanel({ s, notes }: { s: AudienceSummary; notes: string[] }) {
  const f = s.funnel;
  const steps: [string, number, number | null][] = [['Visits', f.visits, null], ['Viewed a product', f.productViews, s.conversion.visitToProduct], ['Added to cart', f.addToCart, s.conversion.productToCart], ['Started checkout', f.checkoutStarts, s.conversion.cartToCheckout], ['Paid orders', f.paidOrders, s.conversion.checkoutToPaid]];
  return <section className="mt-8">
    <h2 className="mb-1 text-xl font-bold text-stone-900">Customers &amp; traffic</h2>
    <p className="mb-4 text-sm text-stone-600">Visits are counted without cookies, one per browser tab session. Tracking started 25 Oct 2026, so earlier dates show orders only. Times are India time.</p>
    {notes.map(n => <p key={n} className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{n}</p>)}
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Shopping funnel" detail="How many visits reached each step. Percentages are from the step before.">
        <ol className="space-y-2 text-sm">{steps.map(([label, n, rate]) => <li key={label} className="flex justify-between gap-3 border-b border-stone-100 pb-2"><span>{label}</span><span><strong>{n}</strong>{rate !== null && <span className="ml-2 text-xs text-stone-500">{pct(rate)}</span>}</span></li>)}</ol>
        <p className="mt-3 text-xs text-stone-500">Visit to paid order: {pct(s.conversion.visitToPaid)}</p>
      </Section>
      <Section title="When orders are placed" detail={s.busiestOrderHour ? `Busiest hour so far: ${s.busiestOrderHour.label}.` : 'Paid orders by hour of day.'}>
        <Hours s={s} field="orders" />
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs">{s.weekdays.map(d => <div key={d.label} className="rounded bg-stone-50 py-2"><div className="text-stone-500">{d.label}</div><strong>{d.orders}</strong></div>)}</div>
      </Section>
      <Section title="Where orders are delivered" detail="Area from the delivery PIN code (India Post directory). Count · order value.">
        <Bars rows={s.orderAreas} money />
        <div className="mt-4 border-t border-stone-100 pt-3"><p className="mb-2 text-xs font-semibold text-stone-500">By taluk</p><Bars rows={s.orderZones} money /></div>
      </Section>
      <Section title="Where orders came from" detail="The first link or site that brought the buyer within 30 days. Count · order value.">
        <Bars rows={s.orderSources} money />
        {s.orderCampaigns.length > 0 && <div className="mt-4 border-t border-stone-100 pt-3"><p className="mb-2 text-xs font-semibold text-stone-500">Campaigns</p><Bars rows={s.orderCampaigns} money /></div>}
        <div className="mt-4 border-t border-stone-100 pt-3"><p className="mb-2 text-xs font-semibold text-stone-500">Device used to order</p><Bars rows={s.orderDevices} money /></div>
      </Section>
      <Section title="Where visitors come from" detail="Source of each visit. WhatsApp and Instagram apps often hide the referrer, so tag your links (see below).">
        <Bars rows={s.visitSources} />
        <div className="mt-4 border-t border-stone-100 pt-3"><p className="mb-2 text-xs font-semibold text-stone-500">Visitor location (approximate city)</p><Bars rows={s.visitCities} /></div>
      </Section>
      <Section title="When people visit" detail="Visits by hour of day and device.">
        <Hours s={s} field="visits" />
        <div className="mt-4 border-t border-stone-100 pt-3"><Bars rows={s.visitDevices} /></div>
      </Section>
      <Section title="Pages that bring people in" detail="First page of each visit.">
        <Bars rows={s.landingPages} />
      </Section>
      <Section title="Most viewed products" detail="Product page views.">
        <Bars rows={s.productPages} />
      </Section>
      <Section title="Tag your links to see what works" detail="Add these endings to any store link you share. Visits and orders will then show under that name.">
        <ul className="space-y-2 break-all text-xs text-stone-700">
          <li><strong>Instagram bio:</strong> store.postduty.in/?utm_source=instagram&amp;utm_medium=bio</li>
          <li><strong>Instagram reel or story:</strong> store.postduty.in/?utm_source=instagram&amp;utm_medium=reel&amp;utm_campaign=hearts_clip</li>
          <li><strong>WhatsApp status or group:</strong> store.postduty.in/?utm_source=whatsapp&amp;utm_medium=status</li>
          <li><strong>Hospital or friend referral:</strong> store.postduty.in/?utm_source=referral&amp;utm_campaign=name_of_group</li>
        </ul>
      </Section>
    </div>
  </section>;
}
