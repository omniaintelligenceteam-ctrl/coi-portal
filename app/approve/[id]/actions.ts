'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeApprovalToken,
  verifyApprovalToken,
} from '@/lib/approvalToken';
import { adminEmails } from '@/lib/authLogin';
import { decideCertRequest } from '@/lib/decideCert';

/**
 * Server actions for the mobile approval card. Both:
 *   1. Re-verify the token (defense in depth — page already verified at render,
 *      but never trust the client between render and submit).
 *   2. Re-check admin allowlist (token TTL is 72h; access can change).
 *   3. Atomically consume the token (single-use; race-safe).
 *   4. Delegate the actual work to lib/decideCert.ts (same code path as the
 *      desktop dashboard form).
 *   5. Redirect to ?done=<kind> on success or ?err=<code> on failure.
 *
 * The redirect carries minimal context so the result page can render a
 * meaningful state. Token is NOT preserved past consumption.
 */

type RequestContext = {
  requestId: string;
  rawToken: string;
};

function readContext(formData: FormData): RequestContext | null {
  const requestId = String(formData.get('requestId') ?? '');
  const rawToken = String(formData.get('token') ?? '');
  if (!requestId || !rawToken) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return null;
  }
  return { requestId, rawToken };
}

async function forensicMeta(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers();
  // Vercel sets x-forwarded-for; first hop is the client.
  const xff = h.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0]?.trim() ?? null : h.get('x-real-ip');
  return { ip: ip ?? null, ua: h.get('user-agent') };
}

export async function approveAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  if (!ctx) redirect('/approve/invalid?err=invalid');

  const admin = createAdminClient();

  const verify = await verifyApprovalToken({
    admin,
    requestId: ctx.requestId,
    rawToken: ctx.rawToken,
  });
  if (!verify.ok) {
    redirect(`/approve/${ctx.requestId}?err=${verify.reason}`);
  }
  if (!adminEmails().includes(verify.adminEmail.toLowerCase())) {
    redirect(`/approve/${ctx.requestId}?err=revoked`);
  }

  const { ip, ua } = await forensicMeta();
  const consumed = await consumeApprovalToken({
    admin,
    tokenRowId: verify.tokenRowId,
    action: 'approve',
    ip,
    ua,
  });
  if (!consumed) {
    // Double-tap race — another consumer won. Show "already decided".
    redirect(`/approve/${ctx.requestId}?done=already_decided`);
  }

  const result = await decideCertRequest(admin, verify.adminEmail, {
    decision: 'approve',
    requestId: ctx.requestId,
  });

  if (result.ok && result.status === 'sent') {
    const params = new URLSearchParams({ done: 'approve', cert: result.certNumber });
    redirect(`/approve/${ctx.requestId}?${params.toString()}`);
  }

  // Decision recorded but downstream failed — surface to user.
  if (!result.ok && result.code === 'send_failed') {
    redirect(`/approve/${ctx.requestId}?done=send_failed`);
  }
  if (!result.ok && result.code === 'already_decided') {
    redirect(`/approve/${ctx.requestId}?done=already_decided`);
  }

  // Fallback for unexpected error codes.
  redirect(`/approve/${ctx.requestId}?err=invalid`);
}

export async function rejectAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  if (!ctx) redirect('/approve/invalid?err=invalid');

  const decisionNote = String(formData.get('decisionNote') ?? '').trim();
  if (decisionNote.length < 4) {
    // Should be blocked by client; bounce back to the card if it slips.
    redirect(`/approve/${ctx.requestId}?t=${encodeURIComponent(ctx.rawToken)}`);
  }

  const admin = createAdminClient();

  const verify = await verifyApprovalToken({
    admin,
    requestId: ctx.requestId,
    rawToken: ctx.rawToken,
  });
  if (!verify.ok) {
    redirect(`/approve/${ctx.requestId}?err=${verify.reason}`);
  }
  if (!adminEmails().includes(verify.adminEmail.toLowerCase())) {
    redirect(`/approve/${ctx.requestId}?err=revoked`);
  }

  const { ip, ua } = await forensicMeta();
  const consumed = await consumeApprovalToken({
    admin,
    tokenRowId: verify.tokenRowId,
    action: 'reject',
    ip,
    ua,
  });
  if (!consumed) {
    redirect(`/approve/${ctx.requestId}?done=already_decided`);
  }

  const result = await decideCertRequest(admin, verify.adminEmail, {
    decision: 'reject',
    requestId: ctx.requestId,
    decisionNote,
  });

  if (result.ok && result.status === 'rejected') {
    const params = new URLSearchParams({ done: 'reject', note: decisionNote });
    redirect(`/approve/${ctx.requestId}?${params.toString()}`);
  }
  if (!result.ok && result.code === 'already_decided') {
    redirect(`/approve/${ctx.requestId}?done=already_decided`);
  }

  redirect(`/approve/${ctx.requestId}?err=invalid`);
}
