import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase auth session on every request. Required so that
 * mobile Safari (ITP + SameSite quirks) reliably keeps the user signed in
 * after the magic-link callback. Without this, cookies set in
 * /auth/callback can fail to attach to the next request and the user
 * bounces back to /login.
 *
 * Pattern: https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Read the "remember me" preference cookie set by /auth/callback. If the
  // user opted out, strip maxAge/expires from the refreshed auth cookies so
  // they die when the browser closes. Default (cookie missing or "1") keeps
  // the long-lived persistent behavior.
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

  // Touching getUser() forces the client to refresh the session cookie
  // when needed. Do NOT remove — that's the whole point of this file.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
};
