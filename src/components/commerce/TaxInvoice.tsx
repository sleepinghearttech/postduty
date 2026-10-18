import type { InvoiceView } from '@/lib/tax-invoice';

const money = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (bps: number | null) => bps === null ? '—' : `${bps / 100}%`;

/** Presentational only; shared by the owner page (server) and the customer order page (client). */
export default function TaxInvoice({ invoice }: { invoice: InvoiceView }) {
  const tax = invoice.kind === 'tax_invoice';
  const cell = 'border border-stone-300 px-2 py-1 align-top';
  return <article className="tax-invoice bg-white text-stone-900 text-sm">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-300 pb-4">
      <div>
        <p className="text-lg font-bold">{invoice.seller.legalName}</p>
        {invoice.seller.address && <p className="whitespace-pre-line text-xs leading-5">{invoice.seller.address}</p>}
        <p className="text-xs">State: {invoice.seller.state} ({invoice.seller.stateCode})</p>
        {invoice.seller.gstin && <p className="text-xs font-semibold">GSTIN: {invoice.seller.gstin}</p>}
      </div>
      <div className="text-right">
        <p className="text-xl font-bold uppercase tracking-wide">{invoice.title}</p>
        <p className="font-mono">No. {invoice.number}</p>
        <p className="text-xs">Date: {new Date(invoice.date).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}</p>
        <p className="text-xs">Order #{invoice.orderReference}</p>
        {['cancelled', 'refunded'].includes(invoice.status) && <p className="mt-1 text-xs font-semibold uppercase text-rose-700">Order {invoice.status}</p>}
      </div>
    </header>
    <section className="grid gap-4 py-4 sm:grid-cols-2">
      <div><p className="text-xs font-semibold uppercase text-stone-500">Billed and shipped to</p><p className="font-semibold">{invoice.buyer.name}</p>{invoice.buyer.addressLines.map((line, i) => <p key={i}>{line}</p>)}<p>State: {invoice.buyer.state} ({invoice.buyer.stateCode})</p></div>
      <div className="sm:text-right"><p className="text-xs font-semibold uppercase text-stone-500">Place of supply</p><p>{invoice.placeOfSupply}</p>{tax && <p className="text-xs text-stone-500">{invoice.intraState ? 'Intra-state supply: CGST + SGST' : 'Inter-state supply: IGST'}</p>}</div>
    </section>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-stone-100"><tr>
          <th className={cell}>Description</th>{tax && <th className={cell}>HSN</th>}<th className={cell}>Qty</th>
          <th className={`${cell} text-right`}>{tax ? 'Taxable value' : 'Amount'}</th>
          {tax && <><th className={cell}>Rate</th>{invoice.intraState ? <><th className={`${cell} text-right`}>CGST</th><th className={`${cell} text-right`}>SGST</th></> : <th className={`${cell} text-right`}>IGST</th>}<th className={`${cell} text-right`}>Total</th></>}
        </tr></thead>
        <tbody>{invoice.rows.map((row, i) => <tr key={i}>
          <td className={cell}>{row.description}</td>{tax && <td className={cell}>{row.hsn ?? '—'}</td>}<td className={cell}>{row.quantity ?? '—'}</td>
          <td className={`${cell} text-right`}>{money(row.taxable_value)}</td>
          {tax && <><td className={cell}>{rate(row.rate_bps)}</td>{invoice.intraState ? <><td className={`${cell} text-right`}>{money(row.cgst)}</td><td className={`${cell} text-right`}>{money(row.sgst)}</td></> : <td className={`${cell} text-right`}>{money(row.igst)}</td>}<td className={`${cell} text-right`}>{money(row.total)}</td></>}
        </tr>)}</tbody>
        <tfoot className="font-semibold"><tr>
          <td className={cell} colSpan={tax ? 3 : 2}>Total</td><td className={`${cell} text-right`}>{money(invoice.totals.taxable_value)}</td>
          {tax && <><td className={cell} />{invoice.intraState ? <><td className={`${cell} text-right`}>{money(invoice.totals.cgst)}</td><td className={`${cell} text-right`}>{money(invoice.totals.sgst)}</td></> : <td className={`${cell} text-right`}>{money(invoice.totals.igst)}</td>}<td className={`${cell} text-right`}>{money(invoice.totals.total)}</td></>}
        </tr></tfoot>
      </table>
    </div>
    <div className="mt-4 flex flex-wrap justify-between gap-3">
      <div className="text-xs text-stone-600">{invoice.inclusiveNote && <p className="font-semibold">{invoice.inclusiveNote}</p>}{tax && <p>Total tax: ₹{money(invoice.totals.tax)}</p>}{!tax && <p>Supplier not registered under GST; no tax is charged on this receipt.</p>}{tax && <p>Shipping and gift card charges are part of a composite supply and taxed at the rate of the goods.</p>}</div>
      <p className="text-base font-bold">Amount paid: ₹{money(invoice.totals.total)}</p>
    </div>
    <p className="mt-6 text-xs text-stone-500">This is a computer-generated document and does not require a signature.</p>
  </article>;
}
