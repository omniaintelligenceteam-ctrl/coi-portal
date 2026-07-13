/**
 * Renewal automation orchestrator.
 *
 * Called from the two places a renewal can land:
 *   - update-policy: same policy row, exp_date moved forward
 *   - save-policy: fresh policy row adjacent to an expiring one (import)
 *
 * Records the renewal event, clears the expiry-warning idempotency markers
 * (so the next cycle warns again), and rolls every live cert through the
 * trust ladder via reissueAffectedCerts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { reissueAffectedCerts, type ReissueSummary } from './reissueAffected';
import type { IssueCertClient } from './issueCert';
import { log } from './logger';

export type RenewalResult = {
  renewalId: string | null;
  summary: ReissueSummary;
};

export async function processRenewal(
  admin: SupabaseClient,
  args: {
    /** Policy row now carrying the new dates. */
    renewedPolicyId: string;
    /** Old policy row when the renewal arrived as a new row (import path). */
    previousPolicyId?: string;
    clientId: string;
    oldExpDate: string | null;
    newExpDate: string;
    byEmail: string;
    requestedIp: string | null;
  },
): Promise<RenewalResult> {
  // 1. Record the event first — even if reissue fails, the renewal happened.
  const { data: renewalRow, error: renErr } = await admin
    .from('renewals')
    .insert({
      client_id: args.clientId,
      policy_id: args.renewedPolicyId,
      previous_policy_id: args.previousPolicyId ?? null,
      old_exp_date: args.oldExpDate,
      new_exp_date: args.newExpDate,
      renewed_by_email: args.byEmail,
    })
    .select('id')
    .maybeSingle<{ id: string }>();
  if (renErr) {
    log.error('renewals.record_failed', {
      policyId: args.renewedPolicyId,
      error: renErr.message,
    });
  }

  // 2. Re-arm the expiry warnings for the new term.
  const { error: markerErr } = await admin
    .from('policies')
    .update({ renewal_30_notified_at: null, renewal_7_notified_at: null })
    .eq('id', args.renewedPolicyId);
  if (markerErr) {
    log.warn('renewals.marker_reset_failed', {
      policyId: args.renewedPolicyId,
      error: markerErr.message,
    });
  }

  // 3. Roll live certs. Certs reference the OLD id on the import path.
  const { data: client, error: clientErr } = await admin
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2')
    .eq('id', args.clientId)
    .maybeSingle<IssueCertClient>();

  let summary: ReissueSummary = { reissued: 0, failed: 0, skippedInFlight: 0, outcomes: [] };
  if (client && !clientErr) {
    try {
      summary = await reissueAffectedCerts(admin, {
        policyId: args.previousPolicyId ?? args.renewedPolicyId,
        issueFromPolicyId: args.renewedPolicyId,
        client,
        requestedByEmail: args.byEmail,
        requestedIp: args.requestedIp,
      });
    } catch (err) {
      log.error('renewals.reissue_failed', {
        policyId: args.renewedPolicyId,
        error: (err as Error).message,
      });
      summary = { reissued: 0, failed: -1, skippedInFlight: 0, outcomes: [] };
    }
  }

  // 4. Close out the event row.
  if (renewalRow?.id) {
    const status =
      summary.failed === -1
        ? 'reissue_failed'
        : summary.failed > 0
          ? 'reissue_partial'
          : 'processed';
    await admin
      .from('renewals')
      .update({
        reissued: summary.reissued,
        failed: Math.max(0, summary.failed),
        skipped_in_flight: summary.skippedInFlight,
        status,
      })
      .eq('id', renewalRow.id);
  }

  log.info('renewals.processed', {
    renewalId: renewalRow?.id ?? null,
    policyId: args.renewedPolicyId,
    previousPolicyId: args.previousPolicyId ?? null,
    reissued: summary.reissued,
    failed: summary.failed,
    skippedInFlight: summary.skippedInFlight,
  });

  return { renewalId: renewalRow?.id ?? null, summary };
}
