import { NextResponse } from 'next/server';

export function middleware(): NextResponse {
  // Pass-through middleware strictly required by Vercel.
  // Next 16 doesn't output server/middleware.js without a defined middleware,
  // which crashes the Vercel bundle process.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
