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
import type { IssueCertClient } from '@/lib/issueCert';
import { reissueAffectedCerts } from '@/lib/reissueAffected';
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

  const requestedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const summary = await reissueAffectedCerts(admin, {
    policyId: body.policyId,
    client,
    requestedByEmail: user!.email!,
    requestedIp,
  });

  log.info('policy.reissue_affected', {
    policyId: body.policyId,
    clientId: client.id,
    type: policy.type,
    policyNumber: policy.policy_number,
    by: email,
    reissued: summary.reissued,
    failed: summary.failed,
    skippedInFlight: summary.skippedInFlight,
  });

  return NextResponse.json({ ok: true, ...summary });
}
