import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  canRequestPortalLogin,
  createPortalLoginTicket,
  isValidEmail,
  LOGIN_LINK_EXPIRES_MINUTES,
  normalizeEmail,
} from '@/lib/authLogin';
import { sendPortalLoginEmail } from '@/lib/email';

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

  // Anti-enumeration: always respond ok regardless of whether the email is approved.
  // Only generate + send a link when the email is actually allowed.
  try {
    const canLogin = await canRequestPortalLogin(email);
    if (canLogin) {
      const ticket = await createPortalLoginTicket({ email, remember });
      await sendPortalLoginEmail({
        to: email,
        confirmUrl: ticket.confirmUrl,
        emailOtp: ticket.emailOtp,
        expiresMinutes: LOGIN_LINK_EXPIRES_MINUTES,
      });
    } else {
      console.info('request-login.skipped', { email });
    }

    const cookieStore = await cookies();
    const thirtyDays = 60 * 60 * 24 * 30;
    cookieStore.set('pp_remember', remember ? '1' : '0', {
      path: '/',
      sameSite: 'lax',
      secure: true,
      httpOnly: false,
      maxAge: remember ? thirtyDays : undefined,
    });
  } catch (err) {
    console.error('request-login failed', err);
    // Still return ok to avoid leaking information about which emails are valid.
  }

  return NextResponse.json({ ok: true });
}
