/**
 * Admin endpoint — reactivate a coverage that was previously cancelled.
 *
 * Undo path for /api/admin/cancel-coverage. Only flips back if the policy is
 * still in 'cancelled' state and not past its exp_date (expired coverages
 * shouldn't be revived via this endpoint — those need a new policy import).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  const { data: updated, error: updErr } = await admin
    .from('policies')
    .update({
      status: 'active',
      cancelled_at: null,
      cancelled_reason: null,
    })
    .eq('id', body.policyId)
    .eq('status', 'cancelled')
    .select('id, type, policy_number, exp_date')
    .maybeSingle();
  if (updErr) {
    return NextResponse.json({ error: 'db error', detail: updErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'policy not found or not in cancelled state' },
      { status: 409 },
    );
  }

  log.info('coverage.uncancelled', {
    policyId: body.policyId,
    type: updated.type,
    policyNumber: updated.policy_number,
    by: email,
  });

  return NextResponse.json({ ok: true, policy: updated });
}
