import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Return a no-op stub during static prerendering (build-time without env vars)
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
