'use client';
import { useState } from 'react';
import { currency } from '@/lib/business/metrics';
export default function ScenarioCalculator() {
  const [price,setPrice]=useState(''); const [cost,setCost]=useState(''); const [units,setUnits]=useState('');
  const valid=price!==''&&cost!==''&&units!==''&&Number(price)>0&&Number(cost)>=0&&Number(units)>=1&&Number.isInteger(Number(units));
  return <div><div className="grid grid-cols-3 gap-2">{[{label:'Price / unit ₹',value:price,set:setPrice,min:'0.01',step:'0.01'},{label:'Cost / unit ₹',value:cost,set:setCost,min:'0',step:'0.01'},{label:'Units',value:units,set:setUnits,min:'1',step:'1'}].map(field=><label key={field.label} className="min-w-0 text-xs font-semibold">{field.label}<input className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 px-2 text-base" type="number" inputMode="decimal" min={field.min} step={field.step} value={field.value} onChange={e=>field.set(e.target.value)}/></label>)}</div><p role="status" className="mt-4 rounded-xl bg-brand-light p-4 text-sm font-semibold text-brand">{valid?`Hypothetical contribution: ${currency((Number(price)-Number(cost))*Number(units)*100)} · ${((Number(price)-Number(cost))/Number(price)*100).toFixed(1)}% per unit`:'Enter your assumptions to explore a scenario.'}</p><p className="mt-2 text-xs text-stone-500">Include all per-unit costs in your assumption. This is a hypothetical calculation, not a sales forecast or realized profit. It does not save or change prices.</p></div>;
}
