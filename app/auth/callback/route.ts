import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Magic-link callback. Supabase redirects here with `?code=...`; we exchange
 * the code for a session and then route the user to the home page. On error,
 * we send them back to /login with an error flag.
 *
 * Honors `?remember=0|1` from the login form: when `remember=0`, the auth
 * cookies are written without maxAge/expires so they die when the browser
 * closes. A `pp_remember` preference cookie is written so the middleware can
 * keep enforcing the same persistence on every session refresh.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const remember = searchParams.get('remember') !== '0';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const opts = remember
                ? options
                : { ...options, maxAge: undefined, expires: undefined };
              cookieStore.set(name, value, opts);
            });
          } catch {
            // Server Component context — middleware will refresh next request.
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Preference cookie read by middleware on every subsequent request to keep
  // the auth cookies session-only when the user opted out of "remember me".
  const thirtyDays = 60 * 60 * 24 * 30;
  cookieStore.set('pp_remember', remember ? '1' : '0', {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: false,
    maxAge: remember ? thirtyDays : undefined,
  });

  return NextResponse.redirect(`${origin}/`);
}
