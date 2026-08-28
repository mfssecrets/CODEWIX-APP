import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase public config for the browser client.
 *
 * NEXT_PUBLIC_* env vars are inlined by Next.js at BUILD time. On CI
 * environments (e.g. GitHub Actions) where these vars may not be set, we fall
 * back to the project's public Supabase values so the browser client always
 * works. The anon key is PUBLIC by design — it is protected by Supabase Row
 * Level Security, not by secrecy. Overriding via env vars is still supported.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://akiuhzheutxkyjzowrzp.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFraXVoemhldXR4a3lqem93cnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4Njk4MTMsImV4cCI6MjEwMzQ0NTgxM30.et2OiPyJZ1Q3lAlyDvZu817XqhuRoAuaCgWhJMf-TH4';

export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Return a no-op stub during static prerendering (build-time without env vars)
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
