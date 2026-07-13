/**
 * Batch-reissue every live cert that references a policy.
 *
 * Core of renewal automation: given a policy (typically just renewed), find
 * every previously SENT cert that included it, dedupe per holder (most
 * recent send wins), and reissue each through issueCert — the same reviewer +
 * trust-ladder path as any other request. Instant-lane clients' certs go
 * straight back out; manual-lane certs land in the approval queue.
 *
 * `issueFromPolicyId` handles renewals that arrive as a NEW policy row
 * (dec-page import): live certs reference the old policy id, but the fresh
 * cert must be issued from the new one, so the id is swapped in each cert's
 * coverage selection. Same-row renewals (dates updated in place) omit it.
 *
 * In-flight approved/edited requests are skipped — they render with current
 * policy dates at send time anyway. We never auto-void superseded certs: the
 * verify page recomputes live coverage state from the policies table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findAffectedCertsForPolicy } from './affectedCerts';
import { issueCert, type IssueCertClient } from './issueCert';
import { log } from './logger';

export type ReissueOutcome = {
  oldCertNumber: string;
  holderName: string;
  newCertNumber?: string;
  requestId?: string;
  error?: string;
};

export type ReissueSummary = {
  reissued: number;
  failed: number;
  skippedInFlight: number;
  outcomes: ReissueOutcome[];
};

export async function reissueAffectedCerts(
  admin: SupabaseClient,
  args: {
    /** Policy whose live certs are being rolled (the one certs reference). */
    policyId: string;
    /** Policy to issue the fresh certs from. Defaults to policyId. */
    issueFromPolicyId?: string;
    client: IssueCertClient;
    requestedByEmail: string;
    requestedIp: string | null;
  },
): Promise<ReissueSummary> {
  const issueFrom = args.issueFromPolicyId ?? args.policyId;

  const affected = await findAffectedCertsForPolicy(admin, args.policyId);
  const sentCerts = affected.filter((c) => c.status === 'sent');
  const skippedInFlight = affected.length - sentCerts.length;

  const { data: originals, error: origErr } = await admin
    .from('cert_requests')
    .select(
      'id, cert_number, holder_name, holder_address1, holder_address2, coverages_selected, form_type, is_master',
    )
    .in('id', sentCerts.map((c) => c.requestId));
  if (origErr) throw new Error(`reissueAffectedCerts: ${origErr.message}`);
  const originalById = new Map((originals ?? []).map((r) => [r.id, r]));

  // Dedupe per holder — sentCerts is ordered most-recent-send first.
  const seenHolders = new Set<string>();
  const toReissue: NonNullable<typeof originals> = [];
  for (const cert of sentCerts) {
    const row = originalById.get(cert.requestId);
    if (!row) continue;
    const holderKey = `${row.holder_name}|${row.holder_address1}`.toLowerCase();
    if (seenHolders.has(holderKey)) continue;
    seenHolders.add(holderKey);
    toReissue.push(row);
  }

  const outcomes: ReissueOutcome[] = [];

  // Sequential on purpose: each issue renders a PDF and (instant lane) sends
  // an email — parallel fan-out would spike memory and Resend throughput.
  for (const original of toReissue) {
    const selectedPolicyIds = (original.coverages_selected as string[]).map((id) =>
      id === args.policyId ? issueFrom : id,
    );
    const result = await issueCert({
      reader: admin,
      admin,
      client: args.client,
      selectedPolicyIds,
      holder: {
        name: original.holder_name,
        address1: original.holder_address1,
        address2: original.holder_address2 ?? '',
      },
      requestedByEmail: args.requestedByEmail,
      requestedIp: args.requestedIp,
      isMaster: original.is_master === true,
      formId: original.form_type ?? undefined,
      bypassRateLimit: true,
    });
    if (result.ok) {
      outcomes.push({
        oldCertNumber: original.cert_number,
        holderName: original.holder_name,
        newCertNumber: result.certNumber,
        requestId: result.requestId,
      });
    } else {
      outcomes.push({
        oldCertNumber: original.cert_number,
        holderName: original.holder_name,
        error: result.detail || result.error,
      });
    }
  }

  const reissued = outcomes.filter((o) => o.newCertNumber).length;
  const summary: ReissueSummary = {
    reissued,
    failed: outcomes.length - reissued,
    skippedInFlight,
    outcomes,
  };
  log.info('reissueAffected.completed', {
    policyId: args.policyId,
    issueFromPolicyId: issueFrom,
    clientId: args.client.id,
    liveCerts: affected.length,
    ...{ reissued: summary.reissued, failed: summary.failed, skippedInFlight },
  });
  return summary;
}
