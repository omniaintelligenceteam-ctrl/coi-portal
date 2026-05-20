import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import {
  canRequestPortalLogin,
  createPortalLoginTicket,
  isValidEmail,
  normalizeEmail,
} from '@/lib/authLogin';

type Body = {
  email?: string;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? '');

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const canLogin = await canRequestPortalLogin(email);
  if (!canLogin) {
    return NextResponse.json(
      { error: "That email isn't set up for portal access yet." },
      { status: 403 },
    );
  }

  let tokenHash: string;
  let verificationType: EmailOtpType;
  try {
    const ticket = await createPortalLoginTicket({ email, remember: true });
    tokenHash = ticket.tokenHash;
    verificationType = ticket.verificationType;
  } catch (err) {
    console.error('request-login: token generation failed', err);
    return NextResponse.json(
      { error: 'Could not sign you in. Try again in a moment.' },
      { status: 500 },
    );
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
            cookieStore.set(name, value, {
              ...options,
              maxAge: ONE_YEAR_SECONDS,
            });
          });
        },
      },
    },
  );

  const primary = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: verificationType });
  let error = primary.error;
  if (error && verificationType === 'magiclink') {
    const fallback = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    error = fallback.error;
  }

  if (error) {
    console.error('request-login: verifyOtp failed', error);
    return NextResponse.json(
      { error: 'Could not sign you in. Try again in a moment.' },
      { status: 500 },
    );
  }

  cookieStore.set('pp_remember', '1', {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: false,
    maxAge: ONE_YEAR_SECONDS,
  });

  return NextResponse.json({ ok: true });
}
