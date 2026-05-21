/**
 * Twilio SMS helpers.
 *
 * Inbound: lib/twilio signature verification + phone-to-client lookup.
 * Outbound: send a single SMS via the Twilio Messages API.
 *
 * Configured by three env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER     (the from-number for outbound)
 *
 * All helpers degrade gracefully when env is missing — they log and no-op
 * rather than throwing — so adding SMS to a deployment is just a matter of
 * setting the env vars + configuring Twilio's webhook URL.
 */

import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

export type SmsConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export function readSmsConfig(): SmsConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

/**
 * Verify Twilio's X-Twilio-Signature header. Twilio HMAC-SHA1's the full URL
 * concatenated with the alphabetically-sorted form params, base64-encodes
 * the result, and sends it as the header. We rebuild and compare.
 *
 * See: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(args: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const sortedKeys = Object.keys(args.params).sort();
  let data = args.url;
  for (const key of sortedKeys) {
    data += key + args.params[key];
  }
  const computed = createHmac('sha1', args.authToken).update(data, 'utf-8').digest('base64');
  // Constant-time compare to dodge timing oracles.
  const a = Buffer.from(computed);
  const b = Buffer.from(args.signature);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Normalize a US phone number to digits-only for matching against the phone
 * column. Strips +1 / formatting / spaces. Returns null if it doesn't look
 * like a valid 10-digit US number.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

/**
 * Look up a coi_clients row by phone number. Uses the existing `phone`
 * column on coi_clients (added in feature-Phase-1 migration). Matches by
 * stripped-digits comparison since the column may carry any formatting.
 *
 * Returns null if no match — the inbound handler replies with a help message
 * directing the unknown texter to /signup.
 */
export async function findClientByPhone(
  admin: SupabaseClient,
  inboundPhone: string,
): Promise<{ id: string; business_name: string; contact_email: string } | null> {
  const normalized = normalizePhone(inboundPhone);
  if (!normalized) return null;

  // Approach: pull all active clients with non-null phones and match in code.
  // For The Policy Place's expected scale (dozens to low hundreds of clients)
  // this is fine. At higher scale, add a normalized phone column + index.
  const { data: candidates } = await admin
    .from('coi_clients')
    .select('id, business_name, contact_email, phone')
    .eq('active', true)
    .is('archived_at', null)
    .not('phone', 'is', null);

  for (const c of candidates ?? []) {
    const cnorm = normalizePhone((c as { phone: string }).phone);
    if (cnorm === normalized) {
      return {
        id: (c as { id: string }).id,
        business_name: (c as { business_name: string }).business_name,
        contact_email: (c as { contact_email: string }).contact_email,
      };
    }
  }
  return null;
}

/**
 * Send a single SMS via the Twilio Messages REST API. Logs but doesn't throw
 * on failure — the inbound handler should never crash because the reply
 * couldn't be sent (Brook can follow up by email if SMS fails).
 */
export async function sendSms(args: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const cfg = readSmsConfig();
  if (!cfg) {
    log.warn('sms.send_skipped_no_config', { to: args.to });
    return { ok: false, error: 'twilio not configured' };
  }

  // Truncate to two segments (~306 chars) to avoid runaway billing on
  // accidentally-long AI replies.
  const body = args.body.slice(0, 300);

  const authHeader = 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');

  try {
    const res = await fetch(
      `${TWILIO_API_BASE}/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: cfg.fromNumber,
          To: args.to,
          Body: body,
        }).toString(),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      log.error('sms.send_failed', { to: args.to, status: res.status, error: text });
      return { ok: false, error: `twilio ${res.status}: ${text}` };
    }
    const json = (await res.json()) as { sid?: string };
    log.info('sms.sent', { to: args.to, sid: json.sid });
    return { ok: true, sid: json.sid };
  } catch (err) {
    log.error('sms.send_threw', {
      to: args.to,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
