import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Magic-link callback. Supabase redirects here with `?code=...`; we exchange
 * the code for a session and then route the user to the home page. On error,
 * we send them back to /login with an error flag.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return NextResponse.redirect(`${origin}/`);
}
