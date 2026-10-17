'use client';

export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white">Print packing slip</button>;
}
