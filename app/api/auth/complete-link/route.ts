import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

type Body = {
  tokenHash?: string;
  type?: EmailOtpType;
  remember?: boolean;
};

const ALLOWED_TYPES = new Set<EmailOtpType>(['magiclink', 'email']);

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const tokenHash = String(body.tokenHash ?? '').trim();
  const remember = body.remember !== false;
  const requestedType = (body.type ?? 'magiclink') as EmailOtpType;
  const type: EmailOtpType = ALLOWED_TYPES.has(requestedType) ? requestedType : 'magiclink';

  if (tokenHash.length < 20) {
    return NextResponse.json({ error: 'Missing sign-in token.' }, { status: 400 });
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
            const opts = remember
              ? options
              : { ...options, maxAge: undefined, expires: undefined };
            cookieStore.set(name, value, opts);
          });
        },
      },
    },
  );

  const primary = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  let error = primary.error;

  if (error && type === 'magiclink') {
    const fallback = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json(
      {
        error:
          'This sign-in link is no longer valid. Request a new one and use it right away.',
      },
      { status: 400 },
    );
  }

  const thirtyDays = 60 * 60 * 24 * 30;
  cookieStore.set('pp_remember', remember ? '1' : '0', {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: false,
    maxAge: remember ? thirtyDays : undefined,
  });

  return NextResponse.json({ ok: true });
}

