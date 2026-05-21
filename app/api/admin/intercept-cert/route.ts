/**
 * Admin endpoint — intercept a holdback cert before it auto-releases.
 *
 * Brook (or any admin) hits this during the 1-hour holdback window to pull a
 * cert back into manual review. The row stays at status='reviewed' (so the
 * cron sweep skips it) and gets intercepted_at + intercepted_by_email
 * stamped for audit. From there Brook can approve / edit / reject the row
 * via the existing /api/decide-cert route.
 *
 * Body: { requestId: uuid }
 *
 * Idempotent: re-hitting on an already-intercepted row returns ok=true.
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
  requestId: z.string().uuid(),
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
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Guard on the row still being in a holdback that hasn't run. If the cron
  // has already released the cert (status=approved/sent), bail with a clear
  // message so the UI can stop showing the intercept button.
  const { data: row, error: readErr } = await admin
    .from('cert_requests')
    .select('id, status, auto_approve_lane, intercepted_at, cert_number')
    .eq('id', body.requestId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: 'db error', detail: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (row.intercepted_at) {
    // Idempotent: already intercepted, nothing to do.
    return NextResponse.json({ ok: true, alreadyIntercepted: true, certNumber: row.cert_number });
  }

  if (row.status !== 'reviewed' || row.auto_approve_lane !== 'holdback') {
    return NextResponse.json(
      {
        error: 'not interceptable',
        detail: `cert is at status='${row.status}', lane='${row.auto_approve_lane ?? 'null'}'. Holdback already released or never started.`,
      },
      { status: 409 },
    );
  }

  const { data: updated, error: writeErr } = await admin
    .from('cert_requests')
    .update({
      intercepted_at: new Date().toISOString(),
      intercepted_by_email: email,
      // Clear the lane so the cron sweep excludes this row going forward.
      auto_approve_lane: 'manual',
    })
    .eq('id', body.requestId)
    .eq('status', 'reviewed')
    .eq('auto_approve_lane', 'holdback')
    .is('intercepted_at', null)
    .select('id, cert_number')
    .maybeSingle();

  if (writeErr) {
    return NextResponse.json({ error: 'db error', detail: writeErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'race', detail: 'Holdback was already released or intercepted by another admin.' },
      { status: 409 },
    );
  }

  log.info('cert.intercepted', {
    requestId: updated.id,
    certNumber: updated.cert_number,
    by: email,
  });

  return NextResponse.json({ ok: true, certNumber: updated.cert_number });
}
