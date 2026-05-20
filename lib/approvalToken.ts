/**
 * Signed single-use approval tokens for the admin queue-notification email.
 *
 * The token in the email URL is the proof of identity AND the proof of
 * authorization for one specific cert_request. No session cookie required —
 * solves the "Brook taps the approval email on her phone and Gmail's in-app
 * webview has no session" problem (see plan jazzy-questing-squirrel.md).
 *
 * Lifecycle:
 *   mintApprovalToken    — randomBytes → HMAC-SHA256(token, APPROVAL_TOKEN_SECRET)
 *                          → insert row with token_hash, return RAW token (only
 *                          time it exists in plaintext, goes into email URL)
 *   verifyApprovalToken  — recompute HMAC on incoming token, look up by hash,
 *                          check expiry + not-yet-consumed + request match
 *   consumeApprovalToken — atomic UPDATE … WHERE consumed_at IS NULL RETURNING id
 *                          (race-safe single-use)
 *
 * Service-role only. Never imported from client components.
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function approvalSecret(): string {
  const secret = process.env.APPROVAL_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'APPROVAL_TOKEN_SECRET is missing or too short (need >=32 hex chars). Generate with `openssl rand -hex 32`.',
    );
  }
  return secret;
}

function hashToken(rawToken: string): string {
  return createHmac('sha256', approvalSecret()).update(rawToken).digest('hex');
}

export type MintInput = {
  admin: SupabaseClient;
  requestId: string;
  adminEmail: string;
  ttlMs?: number;
};

export type MintResult = {
  rawToken: string;
  expiresAt: string;
};

export async function mintApprovalToken(input: MintInput): Promise<MintResult> {
  const rawToken = randomBytes(32).toString('hex'); // 64 hex chars, ~256 bits
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString();

  const { error } = await input.admin.from('cert_approval_tokens').insert({
    request_id: input.requestId,
    admin_email: input.adminEmail.toLowerCase(),
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`mintApprovalToken insert failed: ${error.message}`);

  return { rawToken, expiresAt };
}

export type VerifyInput = {
  admin: SupabaseClient;
  requestId: string;
  rawToken: string;
};

export type VerifyOk = {
  ok: true;
  tokenRowId: string;
  adminEmail: string;
  expiresAt: string;
};

export type VerifyFailReason =
  | 'invalid'      // token not found (tampered, expired-and-purged, or wrong)
  | 'expired'      // token row exists but past expires_at
  | 'consumed'     // token already used
  | 'wrong_request'; // token is for a different cert_request

export type VerifyFail = { ok: false; reason: VerifyFailReason };

export type VerifyResult = VerifyOk | VerifyFail;

type TokenRow = {
  id: string;
  request_id: string;
  admin_email: string;
  expires_at: string;
  consumed_at: string | null;
};

export async function verifyApprovalToken(input: VerifyInput): Promise<VerifyResult> {
  if (!input.rawToken || typeof input.rawToken !== 'string') {
    return { ok: false, reason: 'invalid' };
  }
  // Crude shape gate before any DB work — random 256-bit token in hex is
  // always 64 chars. Anything else is junk or attempted forgery.
  if (input.rawToken.length !== 64 || !/^[0-9a-f]+$/i.test(input.rawToken)) {
    return { ok: false, reason: 'invalid' };
  }

  const tokenHash = hashToken(input.rawToken);

  const { data, error } = await input.admin
    .from('cert_approval_tokens')
    .select('id, request_id, admin_email, expires_at, consumed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle<TokenRow>();
  if (error) throw new Error(`verifyApprovalToken lookup failed: ${error.message}`);
  if (!data) return { ok: false, reason: 'invalid' };

  if (data.request_id !== input.requestId) {
    return { ok: false, reason: 'wrong_request' };
  }
  if (data.consumed_at) {
    return { ok: false, reason: 'consumed' };
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    tokenRowId: data.id,
    adminEmail: data.admin_email,
    expiresAt: data.expires_at,
  };
}

export type ConsumeInput = {
  admin: SupabaseClient;
  tokenRowId: string;
  action: 'approve' | 'reject';
  ip?: string | null;
  ua?: string | null;
};

/**
 * Atomic single-use enforcement. Returns true on first consumer, false if
 * already consumed (double-tap race or replay).
 */
export async function consumeApprovalToken(input: ConsumeInput): Promise<boolean> {
  const { data, error } = await input.admin
    .from('cert_approval_tokens')
    .update({
      consumed_at: new Date().toISOString(),
      consumed_action: input.action,
      consumed_ip: input.ip ?? null,
      consumed_ua: input.ua ?? null,
    })
    .eq('id', input.tokenRowId)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`consumeApprovalToken update failed: ${error.message}`);
  return Boolean(data?.id);
}
