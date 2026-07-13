/**
 * Svix webhook signature verification (used by Resend's webhooks).
 *
 * HMAC-SHA256 of `${svix-id}.${svix-timestamp}.${rawBody}` keyed with the
 * base64 portion of the signing secret (`whsec_<base64>`), compared
 * timing-safe against each space-separated `v1,<sig>` candidate.
 */

import { createHmac } from 'node:crypto';
import { timingSafeEqual } from './secureCompare';

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(args: {
  secret: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
  /** Injectable clock for tests. */
  nowMs?: number;
}): boolean {
  const ts = Number.parseInt(args.svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > SVIX_TOLERANCE_SECONDS) return false;

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
