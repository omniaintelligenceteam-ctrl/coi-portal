/**
 * Public endpoint — a certificate holder files a cert request via a client's
 * shared holder link (/request/[token]).
 *
 * No auth: possession of the unguessable 64-hex token IS the authorization,
 * and it only grants "file a request into this client's approval pipeline" —
 * the request still passes the AI reviewer + trust ladder like any other.
 * The client's own hourly/daily rate limits apply (issueCert), bounding
 * abuse of a leaked link; Brook can rotate the token to revoke it.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueCert, type IssueCertClient } from '@/lib/issueCert';
import { selectableCoverages } from '@/lib/getClientPolicies';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const BodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  holderName: z.string().min(1).max(200),
  holderAddress1: z.string().min(1).max(200),
  holderAddress2: z.string().max(200).optional().default(''),
  requesterEmail: z.string().email().max(200),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: client, error: clientErr } = await admin
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2, active, archived_at')
    .eq('holder_link_token', body.token)
    .maybeSingle<IssueCertClient & { active: boolean; archived_at: string | null }>();
  if (clientErr || !client || !client.active || client.archived_at) {
    // Same response for unknown/revoked/archived — no token oracle.
    return NextResponse.json({ error: 'link not found or no longer active' }, { status: 404 });
  }

  // All currently eligible policies — same coverage set the insured's own
  // portal form defaults to.
  const { data: policies, error: polErr } = await admin
    .from('policies')
    .select('id, type, eff_date, exp_date, active, status')
    .eq('client_id', client.id);
  if (polErr) {
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }
  const eligible = selectableCoverages(policies ?? [], new Date());
  if (eligible.length === 0) {
    return NextResponse.json(
      { error: 'no active coverage on file for this business' },
      { status: 422 },
    );
  }

  const requestedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const result = await issueCert({
    reader: admin,
    admin,
    client,
    selectedPolicyIds: eligible.map((p) => p.id),
    holder: {
      name: body.holderName,
      address1: body.holderAddress1,
      address2: body.holderAddress2,
    },
    requestedByEmail: body.requesterEmail,
    requestedIp,
    holderContactEmail: body.requesterEmail,
  });

  if (!result.ok) {
    // Don't leak internals to an unauthenticated caller; rate-limit texts are safe.
    const safe = result.status === 429 || result.status === 400 || result.status === 422;
    log.warn('holderRequest.failed', {
      clientId: client.id,
      status: result.status,
      error: result.error,
    });
    return NextResponse.json(
      { error: safe ? result.error : 'request could not be filed' },
      { status: result.status },
    );
  }

  log.info('holderRequest.filed', {
    clientId: client.id,
    certNumber: result.certNumber,
    holderName: body.holderName,
    requesterEmail: body.requesterEmail,
  });

  return NextResponse.json({ ok: true, reference: result.certNumber });
}
