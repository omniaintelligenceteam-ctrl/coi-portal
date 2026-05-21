import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { canRequestPortalLogin } from '@/lib/authLogin';

/**
 * Next.js 16 proxy (formerly known as middleware — see the file convention
 * deprecation notice in Next.js 16). Refreshes the Supabase auth session on
 * every request and enforces live approval status. Removing a row from
 * coi_clients (or removing an email from ADMIN_EMAILS) boots that user at
 * the next request, modulo the 60s approval cache below.
 *
 * Pattern: https://supabase.com/docs/guides/auth/server-side/nextjs
 */

// Per-process approval cache. TTL keeps the proxy cheap on hot paths;
// max size keeps memory bounded under burst traffic.
const APPROVAL_TTL_MS = 60_000;
const APPROVAL_CACHE_MAX = 200;
const approvalCache = new Map<string, { approved: boolean; expiresAt: number }>();

async function isApprovedCached(email: string): Promise<boolean> {
  const key = email.toLowerCase();
  const now = Date.now();
  const hit = approvalCache.get(key);
  if (hit && hit.expiresAt > now) return hit.approved;

  const approved = await canRequestPortalLogin(email);
  if (approvalCache.size >= APPROVAL_CACHE_MAX) {
    const firstKey = approvalCache.keys().next().value;
    if (firstKey) approvalCache.delete(firstKey);
  }
  approvalCache.set(key, { approved, expiresAt: now + APPROVAL_TTL_MS });
  return approved;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Honor an explicit "session-only" preference from older sessions. New
  // logins always set pp_remember=1, so this is just a back-compat branch.
  const persistAuth = request.cookies.get('pp_remember')?.value !== '0';

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts = persistAuth
              ? options
              : { ...options, maxAge: undefined, expires: undefined };
            response.cookies.set(name, value, opts);
          });
        },
      },
    },
  );

  // Refresh the session cookie. Required for mobile Safari ITP behavior.
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.email) {
    const stillApproved = await isApprovedCached(user.email);
    if (!stillApproved) {
      const { pathname } = request.nextUrl;
      const isAuthSurface =
        pathname === '/login' ||
        pathname === '/signup' ||
        pathname.startsWith('/api/auth/') ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/api/access-requests');

      if (!isAuthSurface) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = '';
        url.searchParams.set('error', 'revoked');
        const redirectRes = NextResponse.redirect(url);
        // Clear Supabase auth cookies on the way out so the next request
        // is fully unauthenticated. Cookies may be chunked (sb-*-auth-token.0).
        for (const c of request.cookies.getAll()) {
          if (c.name.startsWith('sb-') && c.name.includes('-auth-token')) {
            redirectRes.cookies.set(c.name, '', { path: '/', maxAge: 0 });
          }
        }
        return redirectRes;
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
};
