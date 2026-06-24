import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client — uses the anon key.
// Safe to use in React components and client-side code.
// Obeys RLS: can only read active products, cannot touch orders.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server client — uses the service role key.
// NEVER import this in a component or any file that runs in the browser.
// Bypasses RLS entirely — used only in server actions and API routes
// to write orders after payment confirmation.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
