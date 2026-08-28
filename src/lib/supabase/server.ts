import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Public Supabase config. NEXT_PUBLIC_* vars are inlined at build time; we fall
 * back to the project's public values when the env vars aren't set (e.g. on
 * CI builds or if the Cloudflare Worker variable is missing). The anon key is
 * PUBLIC by design — protected by RLS, not secrecy. Override via env vars.
 */
const PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://akiuhzheutxkyjzowrzp.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFraXVoemhldXR4a3lqem93cnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4Njk4MTMsImV4cCI6MjEwMzQ0NTgxM30.et2OiPyJZ1Q3lAlyDvZu817XqhuRoAuaCgWhJMf-TH4';

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if middleware refreshes sessions.
          }
        },
      },
    },
  );
};

/**
 * Service-role Supabase client. Bypasses RLS — server-only, never expose the
 * key to the client. Uses @supabase/supabase-js directly (not @supabase/ssr)
 * because the service client has no auth state / cookies, which is simpler
 * and more reliable on the Cloudflare Workers runtime.
 *
 * Throws a clear, actionable error if the env vars are missing so production
 * misconfigurations surface immediately instead of producing silent 500s.
 */
export const createServiceClient = () => {
  const url = PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `createServiceClient: missing env var(s) — ${!url ? 'NEXT_PUBLIC_SUPABASE_URL ' : ''}${!key ? 'SUPABASE_SERVICE_ROLE_KEY' : ''}. Set these in the Cloudflare Worker variables (plain text for NEXT_PUBLIC_*, Secret for SUPABASE_SERVICE_ROLE_KEY).`,
    );
  }
  return createServiceRoleClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

// For middleware usage (no cookie jar, uses request/response)
export const createMiddlewareClient = (request: NextRequest, response: NextResponse) => {
  return createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
};
