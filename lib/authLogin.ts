import type { EmailOtpType } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LOGIN_LINK_EXPIRES_MINUTES = 60;

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

