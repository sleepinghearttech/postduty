import CreatorPortal from './CreatorPortal';
export const dynamic = 'force-dynamic';
export default function CreatorPage() {
  return <CreatorPortal supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''} />;
}
