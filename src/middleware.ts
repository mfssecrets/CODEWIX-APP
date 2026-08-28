import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/', '/signin', '/signup', '/forgot-password', '/pricing'];
const publicApiPrefixes = ['/api/auth/callback', '/api/billing/plans'];
const protectedPrefixes = ['/(workspace)', '/(ide)'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Allow public API routes
  const isPublicApi = publicApiPrefixes.some((p) => pathname.startsWith(p));
  if (isPublicApi) return supabaseResponse;

  // Allow all other /api/ routes (they handle auth internally)
  if (pathname.startsWith('/api/')) return supabaseResponse;

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/signin' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  // Protect workspace and IDE routes
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|logo.svg|robots.txt).*)',
  ],
};
