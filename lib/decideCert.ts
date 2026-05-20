/**
 * Core cert-decision pipeline. Single source of truth for what "approve",
 * "edit", "reject", and "retry" actually DO to a cert_requests row.
 *
 * Two callers share this:
 *   - app/api/decide-cert/route.ts (HTTP, session-authed dashboard form)
 *   - app/admin/approve/[id]/actions.ts (server action, token-authed email link)
 *
 * Both prove `decidedBy` is an admin before calling here. This module just
 * does the work and returns a discriminated result for the caller to map to
 * its own response shape.
 *
 * History: this used to live inline in app/api/decide-cert/route.ts. Pulled
 * out 2026-05-20 so the email-link approval flow can share the same code path
 * (plan: jazzy-questing-squirrel.md).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendApprovedCert } from './sendApprovedCert';
import { sendRejectionEmail } from './email';
import type { CertStatus } from '@/app/components/StatusPill';

export type HolderEdit = { name: string; address1: string; address2: string };

export type OverrideInput = {
  clientId: string;
  scope: 'holder' | 'coverage' | 'general';
  pattern: string;
  correction: string;
};

export type DecisionInput =
  | { decision: 'approve'; requestId: string; override?: OverrideInput }
  | { decision: 'edit'; requestId: string; holder: HolderEdit; override?: OverrideInput }
  | { decision: 'reject'; requestId: string; decisionNote?: string }
  | { decision: 'retry'; requestId: string };

export type DecisionResultOk =
  | { ok: true; status: 'sent'; certNumber: string; emailId: string }
  | { ok: true; status: 'rejected' };

export type DecisionResultErrCode =
  | 'not_found'         // 404
  | 'already_decided'   // 409
  | 'invalid_state'     // 409 (retry on non-approved/edited)
  | 'send_failed'       // 502 — row mutated, email pipeline blew up
  | 'db_error';         // 500

export type DecisionResultErr = {
  ok: false;
  code: DecisionResultErrCode;
  error: string;
  detail?: string;
};

export type DecisionResult = DecisionResultOk | DecisionResultErr;

export async function decideCertRequest(
  admin: SupabaseClient,
  decidedBy: string,
  input: DecisionInput,
): Promise<DecisionResult> {
  const now = new Date().toISOString();

  // ── retry: re-run sendApprovedCert against an already-decided row ─────────
  if (input.decision === 'retry') {
    const { data: existing, error: readErr } = await admin
      .from('cert_requests')
      .select('status')
      .eq('id', input.requestId)
      .maybeSingle<{ status: CertStatus }>();
    if (readErr) return { ok: false, code: 'db_error', error: readErr.message };
    if (!existing) return { ok: false, code: 'not_found', error: 'request not found' };
    if (existing.status !== 'approved' && existing.status !== 'edited') {
      return {
        ok: false,
        code: 'invalid_state',
        error: 'retry not allowed',
        detail: `cert is at status '${existing.status}', not approved/edited`,
      };
    }
    return await runSend(admin, input.requestId);
  }

  // ── reject: terminal, no PDF send, notify client by email ─────────────────
  if (input.decision === 'reject') {
    const { data: guarded, error } = await admin
      .from('cert_requests')
      .update({
        status: 'rejected',
        decision_note: input.decisionNote || null,
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', input.requestId)
      .in('status', ['pending', 'reviewed'])
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, code: 'db_error', error: error.message };
    if (!guarded) return { ok: false, code: 'already_decided', error: 'already_decided' };

    // Non-fatal: rejection-email failure should not unwind the rejected status.
    try {
      const { data: detail } = await admin
        .from('cert_requests')
        .select('cert_number, holder_name, client:coi_clients ( business_name, contact_email )')
        .eq('id', input.requestId)
        .maybeSingle<{
          cert_number: string;
          holder_name: string;
          client: { business_name: string; contact_email: string } | null;
        }>();

      const contactEmail = detail?.client?.contact_email;
      if (detail && contactEmail) {
        const portalBase =
          process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ??
          'https://coi-portal.vercel.app';
        await sendRejectionEmail({
          to: contactEmail,
          certNumber: detail.cert_number,
          insuredBusinessName: detail.client?.business_name ?? 'Insured',
          holderName: detail.holder_name,
          reason:
            input.decisionNote?.trim() ||
            'Please reach out to Brook so we can sort out the details before re-issuing.',
          resubmitUrl: `${portalBase}/`,
        });
      }
    } catch (emailErr) {
      console.error('rejection email failed:', emailErr);
    }

    return { ok: true, status: 'rejected' };
  }

  // ── edit: mutate holder fields, compute diff, flip to 'edited' ────────────
  if (input.decision === 'edit') {
    const { data: existing, error: readErr } = await admin
      .from('cert_requests')
      .select('holder_name, holder_address1, holder_address2')
      .eq('id', input.requestId)
      .maybeSingle();
    if (readErr) return { ok: false, code: 'db_error', error: readErr.message };
    if (!existing) return { ok: false, code: 'not_found', error: 'request not found' };

    const diff = computeHolderDiff(existing, input.holder);
    const { data: guarded, error: updateErr } = await admin
      .from('cert_requests')
      .update({
        status: 'edited',
        holder_name: input.holder.name,
        holder_address1: input.holder.address1,
        holder_address2: input.holder.address2 || null,
        edited_diff: diff,
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', input.requestId)
      .in('status', ['pending', 'reviewed'])
      .select('id')
      .maybeSingle();
    if (updateErr) return { ok: false, code: 'db_error', error: updateErr.message };
    if (!guarded) return { ok: false, code: 'already_decided', error: 'already_decided' };
  } else {
    // ── approve: flip to 'approved' ────────────────────────────────────────
    const { data: guarded, error: updateErr } = await admin
      .from('cert_requests')
      .update({
        status: 'approved',
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', input.requestId)
      .in('status', ['pending', 'reviewed'])
      .select('id')
      .maybeSingle();
    if (updateErr) return { ok: false, code: 'db_error', error: updateErr.message };
    if (!guarded) return { ok: false, code: 'already_decided', error: 'already_decided' };
  }

  // Optional override write (approve/edit only)
  if (input.override) {
    const { error: ovErr } = await admin.from('client_overrides').insert({
      client_id: input.override.clientId,
      scope: input.override.scope,
      pattern: input.override.pattern,
      correction: input.override.correction,
      added_by: decidedBy,
      source_request_id: input.requestId,
    });
    if (ovErr) return { ok: false, code: 'db_error', error: ovErr.message };
  }

  return await runSend(admin, input.requestId);
}

async function runSend(admin: SupabaseClient, requestId: string): Promise<DecisionResult> {
  try {
    const result = await sendApprovedCert(admin, requestId);
    return {
      ok: true,
      status: 'sent',
      certNumber: result.certNumber,
      emailId: result.emailId,
    };
  } catch (err) {
    // Send failed AFTER decision was recorded — row stays at approved/edited so
    // the dashboard's Retry CTA can re-fire. Caller maps this to 502.
    return {
      ok: false,
      code: 'send_failed',
      error: 'send failed',
      detail: (err as Error).message,
    };
  }
}

function computeHolderDiff(
  before: {
    holder_name: string | null;
    holder_address1: string | null;
    holder_address2: string | null;
  },
  after: { name: string; address1: string; address2: string },
): Record<string, { from: string | null; to: string }> {
  const diff: Record<string, { from: string | null; to: string }> = {};
  if (before.holder_name !== after.name) {
    diff.name = { from: before.holder_name, to: after.name };
  }
  if (before.holder_address1 !== after.address1) {
    diff.address1 = { from: before.holder_address1, to: after.address1 };
  }
  if ((before.holder_address2 ?? '') !== after.address2) {
    diff.address2 = { from: before.holder_address2, to: after.address2 };
  }
  return diff;
}
