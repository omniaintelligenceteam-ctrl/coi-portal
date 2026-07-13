/**
 * Resend delivery webhook — advances outbound_email_log rows as Resend
 * reports events (delivered / delivery_delayed / bounced / complained /
 * opened).
 *
 * Resend signs webhooks with Svix headers. Verification: HMAC-SHA256 of
 * `${svix-id}.${svix-timestamp}.${rawBody}` keyed with the base64 portion of
 * RESEND_WEBHOOK_SECRET (`whsec_<base64>`), compared timing-safe against each
 * space-separated `v1,<sig>` candidate in the svix-signature header.
 *
 * Fails closed in production when RESEND_WEBHOOK_SECRET is unset. Events for
 * message ids we never logged (categories we don't ledger) return 200 so
 * Resend doesn't retry them forever.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqual } from '@/lib/secureCompare';
import {
  shouldAdvanceStatus,
  statusForResendEvent,
  type OutboundEmailStatus,
} from '@/lib/outboundEmailLog';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const TOLERANCE_SECONDS = 5 * 60;

function verifySvixSignature(args: {
  secret: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
}): boolean {
  const ts = Number.parseInt(args.svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return false;

  const secretB64 = args.secret.startsWith('whsec_') ? args.secret.slice(6) : args.secret;
  let key: Buffer;
  try {
    key = Buffer.from(secretB64, 'base64');
  } catch {
    return false;
  }
  const signedContent = `${args.svixId}.${args.svixTimestamp}.${args.rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');

  // Header form: "v1,<base64sig>" — possibly several, space-separated.
  for (const candidate of args.svixSignature.split(' ')) {
    const [version, sig] = candidate.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    if (timingSafeEqual(sig, expected)) return true;
  }
  return false;
}

type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { message?: string } | null;
  };
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await req.text();

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      log.error('webhook.resend.secret_missing');
      return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
    }
    // dev/local: allow unsigned calls for manual testing
  } else {
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'missing signature headers' }, { status: 401 });
    }
    if (!verifySvixSignature({ secret, svixId, svixTimestamp, svixSignature, rawBody })) {
      log.warn('webhook.resend.bad_signature', { svixId });
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  const incoming = statusForResendEvent(event.type ?? '');
  if (!emailId || !incoming) {
    // Unknown event type or shape — acknowledge so Resend stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from('outbound_email_log')
    .select('id, status')
    .eq('resend_email_id', emailId)
    .maybeSingle<{ id: string; status: OutboundEmailStatus }>();
  if (readErr) {
    log.error('webhook.resend.read_failed', { emailId, error: readErr.message });
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }
  if (!row) {
    // We don't ledger every category (queue notifications, login links…).
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!shouldAdvanceStatus(row.status, incoming)) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const update: Record<string, unknown> = {
    status: incoming,
    last_event_at: event.created_at ?? new Date().toISOString(),
  };
  if (incoming === 'bounced' && event.data?.bounce?.message) {
    update.bounce_reason = event.data.bounce.message;
  }
  const { error: updErr } = await admin
    .from('outbound_email_log')
    .update(update)
    .eq('id', row.id);
  if (updErr) {
    log.error('webhook.resend.update_failed', { emailId, error: updErr.message });
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  log.info('webhook.resend.event', { emailId, type: event.type, status: incoming });
  return NextResponse.json({ ok: true });
}
