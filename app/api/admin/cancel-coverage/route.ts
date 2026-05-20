/**
 * Admin endpoint — cancel a client's coverage mid-term.
 *
 * Flips policies.status to 'cancelled', stamps cancelled_at/cancelled_reason,
 * and returns the list of live (sent / approved / edited) certs that
 * referenced this policy so Brook can decide which to void.
 *
 * Admin-only via ADMIN_EMAILS allowlist.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAffectedCertsForPolicy } from '@/lib/affectedCerts';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  policyId: z.string().uuid(),
  reason: z.string().min(1).max(500),
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

  // Guard with .eq('status','active') so a second click can't reflip a row
  // that's already cancelled.
  const { data: updated, error: updErr } = await admin
    .from('policies')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: body.reason,
    })
    .eq('id', body.policyId)
    .eq('status', 'active')
    .select('id, client_id, type, policy_number')
    .maybeSingle();
  if (updErr) {
    return NextResponse.json({ error: 'db error', detail: updErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'policy not found or already cancelled' },
      { status: 409 },
    );
  }

  // Surface every live cert that included this coverage. Brook decides whom
  // to void/notify — we never auto-void.
  let affected: Awaited<ReturnType<typeof findAffectedCertsForPolicy>> = [];
  try {
    affected = await findAffectedCertsForPolicy(admin, body.policyId);
  } catch (err) {
    log.error('cancel-coverage.affected_lookup_failed', {
      policyId: body.policyId,
      error: (err as Error).message,
    });
  }

  log.info('coverage.cancelled', {
    policyId: body.policyId,
    clientId: updated.client_id,
    type: updated.type,
    policyNumber: updated.policy_number,
    by: email,
    affectedCount: affected.length,
  });

  return NextResponse.json({
    ok: true,
    policy: updated,
    affected,
  });
}
