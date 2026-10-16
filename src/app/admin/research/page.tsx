import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/commerce-auth';
import { loadBusiness } from '@/lib/business/data';
import { businessRange } from '@/lib/business/metrics';
import { BusinessHeader, DataWarnings } from '@/components/business/BusinessUI';
import ResearchClient from './ResearchClient';
export const dynamic='force-dynamic';
export default async function ResearchPage() {
  if(!await requireOwner())redirect('/admin/login');
  const data=await loadBusiness(businessRange());
  return <main className="mx-auto max-w-6xl px-4 py-6 pb-28"><BusinessHeader title="Find the next good idea." description="A source-backed notebook for products, competitors, packaging and better business decisions. Your approval controls what happens next." data={data}/><DataWarnings data={data}/><ResearchClient initial={data.research} products={data.products.map(p=>({id:p.id,name:p.name}))} available={data.availability.research}/></main>;
}
