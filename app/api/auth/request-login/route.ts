import { NextResponse } from 'next/server';
import {
  LOGIN_LINK_EXPIRES_MINUTES,
  canRequestPortalLogin,
  createPortalLoginTicket,
  isValidEmail,
  normalizeEmail,
} from '@/lib/authLogin';
import { sendPortalLoginEmail } from '@/lib/email';

type Body = {
  email?: string;
  remember?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? '');
  const remember = body.remember !== false;

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const canLogin = await canRequestPortalLogin(email);
  if (!canLogin) {
    return NextResponse.json(
      {
        error:
          "This email isn't set up for portal access yet. Request access first, then we'll send sign-in links instantly.",
      },
      { status: 403 },
    );
  }

  try {
    const ticket = await createPortalLoginTicket({ email, remember });
    await sendPortalLoginEmail({
      to: email,
      confirmUrl: ticket.confirmUrl,
      emailOtp: ticket.emailOtp,
      expiresMinutes: LOGIN_LINK_EXPIRES_MINUTES,
    });
  } catch (err) {
    console.error('request-login failed', err);
    return NextResponse.json(
      { error: 'Could not send your sign-in link right now. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

