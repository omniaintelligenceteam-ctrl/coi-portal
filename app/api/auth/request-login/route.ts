import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import {
  canRequestPortalLogin,
  isValidEmail,
  normalizeEmail,
} from '@/lib/authLogin';
import { createAdminClient } from '@/lib/supabase/admin';

type Body = {
  email?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? '');
  const remember = true;

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const canLogin = await canRequestPortalLogin(email);
  if (!canLogin) {
    return NextResponse.json(
      {
        error:
          "This email isn't set up for portal access yet. Request access first, then you'll be able to sign in instantly.",
      },
      { status: 403 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    const tokenHash = data?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      throw new Error(linkError?.message ?? 'Could not generate sign-in token.');
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
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      },
    );

    const primary = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (primary.error) {
      const fallback = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (fallback.error) {
        throw new Error(fallback.error.message);
      }
    }

    const thirtyDays = 60 * 60 * 24 * 30;
    cookieStore.set('pp_remember', remember ? '1' : '0', {
      path: '/',
      sameSite: 'lax',
      secure: true,
      httpOnly: false,
      maxAge: remember ? thirtyDays : undefined,
    });
  } catch (err) {
    console.error('instant-login failed', err);
    return NextResponse.json(
      { error: 'Could not sign you in right now. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

