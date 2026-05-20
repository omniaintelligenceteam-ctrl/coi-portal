import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LOGIN_LINK_EXPIRES_MINUTES = 60;
export const PORTAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 365 days

export type PortalLoginTicket = {
  confirmUrl: string;
  emailOtp: string;
  verificationType: EmailOtpType;
  tokenHash: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function portalBase(): string {
  return process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ?? 'https://coi-portal.vercel.app';
}

export async function canRequestPortalLogin(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return false;
  if (adminEmails().includes(normalized)) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from('coi_clients')
    .select('id')
    .eq('contact_email', normalized)
    .maybeSingle<{ id: string }>();

  return Boolean(data?.id);
}

export async function createPortalLoginTicket(input: {
  email: string;
  remember: boolean;
}): Promise<PortalLoginTicket> {
  const email = normalizeEmail(input.email);
  const remember = input.remember;
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error || !data?.properties?.hashed_token || !data.properties.email_otp) {
    throw new Error(`Could not generate login token${error ? `: ${error.message}` : ''}`);
  }

  const verificationType: EmailOtpType = 'magiclink';
  const confirmUrl = new URL(`${portalBase()}/auth/confirm`);
  confirmUrl.searchParams.set('token_hash', data.properties.hashed_token);
  confirmUrl.searchParams.set('type', verificationType);
  confirmUrl.searchParams.set('remember', remember ? '1' : '0');

  return {
    confirmUrl: confirmUrl.toString(),
    emailOtp: data.properties.email_otp,
    verificationType,
    tokenHash: data.properties.hashed_token,
  };
}

/**
 * Mints a real Supabase session for an admin who has already proven mailbox
 * possession via a signed approval token. Side effect: sets sb-*-auth-token
 * cookies + pp_remember on the current cookie store. Must be called from a
 * Route Handler or Server Action — Server Components silently drop cookie
 * writes (see lib/supabase/server.ts setAll comment).
 *
 * Used by app/api/approve/[id]/route.ts so a Brook can land on the approval
 * card already logged in, and follow-up clicks (Edit → /admin/queue/[id])
 * work without a re-login.
 *
 * Mirrors the cookie-setting flow in app/api/auth/request-login/route.ts.
 */
export async function mintAdminSession(email: string): Promise<void> {
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
              maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
            });
          });
        },
      },
    },
  );

  const ticket = await createPortalLoginTicket({ email, remember: true });
  const primary = await supabase.auth.verifyOtp({
    token_hash: ticket.tokenHash,
    type: ticket.verificationType,
  });
  let error = primary.error;
  if (error && ticket.verificationType === 'magiclink') {
    const fallback = await supabase.auth.verifyOtp({
      token_hash: ticket.tokenHash,
      type: 'email',
    });
    error = fallback.error;
  }
  if (error) {
    throw new Error(`mintAdminSession verifyOtp failed: ${error.message}`);
  }

  cookieStore.set('pp_remember', '1', {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: false,
    maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
  });
}

