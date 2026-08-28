import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/signin', '/signup', '/forgot-password'];
const publicApiPrefixes = ['/api/otp', '/api/auth/register', '/api/auth/otp'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.includes(pathname)) {
    if (request.cookies.get('next-auth.session-token')?.value ||
      request.cookies.get('__Secure-next-auth.session-token')?.value) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  const isPublicApi = publicApiPrefixes.some((p) => pathname.startsWith(p));
  if (isPublicApi) { return NextResponse.next(); }

  const hasSession = !!request.cookies.get('next-auth.session-token')?.value ||
    !!request.cookies.get('__Secure-next-auth.session-token')?.value;
  if (!hasSession) {
    const loginUrl = new URL('/signin', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads/).*)'],
};
