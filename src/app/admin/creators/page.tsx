import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/commerce-auth';
import CreatorsClient from './CreatorsClient';
export const dynamic = 'force-dynamic';
export default async function AdminCreatorsPage() {
  if (!(await requireOwner())) redirect('/admin/login');
  return <CreatorsClient />;
}
