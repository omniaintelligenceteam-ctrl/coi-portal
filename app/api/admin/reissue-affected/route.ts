/**
 * Admin endpoint — batch-reissue every live cert that references a policy.
 *
 * The renewal counterpart to /api/admin/cancel-coverage: after Brook renews a
 * policy (new eff/exp dates via import or update-policy), one click reissues
 * every previously SENT cert that included that coverage, so each holder gets
 * a fresh certificate carrying the new dates.
 *
 * Semantics:
 *   - Only status='sent' certs are reissued. approved/edited requests are
 *     still in flight and will render with the new dates at send time anyway.
 *   - Deduped per holder (name + address1): a holder who received the cert
 *     twice historically gets ONE renewal cert, from the most recent send.
 *   - Each reissue goes through issueCert — the same reviewer + trust-ladder
 *     path as any other request. Instant-lane clients' certs go straight out;
 *     manual-lane certs land in the approval queue (bulk-approve exists).
 *   - Per-client rate limits are bypassed: this is an admin-initiated batch,
 *     not client/API traffic.
 *
 * We never auto-void the superseded certs — the verify page recomputes live
 * coverage state from the policies table, so old certs age out truthfully.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAffectedCertsForPolicy } from '@/lib/affectedCerts';
import { issueCert, type IssueCertClient } from '@/lib/issueCert';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
// Batch renders N PDFs sequentially — allow more than the default budget.
export const maxDuration = 300;

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  policyId: z.string().uuid(),
});

type ReissueOutcome = {
  oldCertNumber: string;
  holderName: string;
  newCertNumber?: string;
  requestId?: string;
  error?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();

  // The policy must be live and unexpired — "renew first, then reissue".
  const { data: policy, error: polErr } = await admin
    .from('policies')
    .select('id, client_id, type, policy_number, eff_date, exp_date, active, status')
    .eq('id', body.policyId)
    .maybeSingle();
  if (polErr) {
    return NextResponse.json({ error: 'db error', detail: polErr.message }, { status: 500 });
  }
  if (!policy) {
    return NextResponse.json({ error: 'policy not found' }, { status: 404 });
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!policy.active || (policy.status && policy.status !== 'active') || policy.exp_date < todayIso) {
    return NextResponse.json(
      {
        error: 'policy is not active/current',
        detail: 'Renew the policy (update its eff/exp dates) before reissuing certificates from it.',
      },
      { status: 409 },
    );
  }

  const { data: client, error: clientErr } = await admin
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2, active')
    .eq('id', policy.client_id)
    .maybeSingle<IssueCertClient & { active: boolean }>();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }
  if (!client.active) {
    return NextResponse.json({ error: 'client is inactive' }, { status: 400 });
  }

  // Live certs referencing this policy; view is ordered sent_at DESC so the
  // first row per holder is the most recent send.
  const affected = await findAffectedCertsForPolicy(admin, body.policyId);
  const sentCerts = affected.filter((c) => c.status === 'sent');
  const skippedInFlight = affected.length - sentCerts.length;

  // Original request rows carry the holder address + coverages + form.
  const { data: originals, error: origErr } = await admin
    .from('cert_requests')
    .select('id, cert_number, holder_name, holder_address1, holder_address2, coverages_selected, form_type, is_master')
    .in('id', sentCerts.map((c) => c.requestId));
  if (origErr) {
    return NextResponse.json({ error: 'db error', detail: origErr.message }, { status: 500 });
  }
  const originalById = new Map((originals ?? []).map((r) => [r.id, r]));

  // Dedupe per holder, keeping the most recent send.
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

  const requestedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const outcomes: ReissueOutcome[] = [];

  // Sequential on purpose: each issue renders a PDF and (instant lane) sends
  // an email — parallel fan-out here would spike memory and Resend throughput.
  for (const original of toReissue) {
    const result = await issueCert({
      reader: admin,
      admin,
      client,
      selectedPolicyIds: original.coverages_selected as string[],
      holder: {
        name: original.holder_name,
        address1: original.holder_address1,
        address2: original.holder_address2 ?? '',
      },
      requestedByEmail: user!.email!,
      requestedIp,
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
  const failed = outcomes.length - reissued;
  log.info('policy.reissue_affected', {
    policyId: body.policyId,
    clientId: client.id,
    type: policy.type,
    policyNumber: policy.policy_number,
    by: email,
    liveCerts: affected.length,
    reissued,
    failed,
    skippedInFlight,
    dedupedOut: sentCerts.length - toReissue.length,
  });

  return NextResponse.json({
    ok: true,
    reissued,
    failed,
    skippedInFlight,
    outcomes,
  });
}
