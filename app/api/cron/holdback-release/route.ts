/**
 * Vercel Cron: holdback-release sweep.
 *
 * Schedule: every 5 minutes (see vercel.json).
 *
 * What it does:
 *   Find every cert_requests row that is sitting in the holdback lane with
 *   holdback_until <= now and status still 'reviewed' and not intercepted.
 *   Flip each to 'approved' and run sendApprovedCert. This is the moment
 *   the system acts on Brook's behalf during the 70-89 confidence window.
 *
 * Brook can prevent any individual release by hitting
 * POST /api/admin/intercept-cert — that sets intercepted_at and clears the
 * lane, which excludes the row from this sweep's WHERE clause.
 *
 * Auth: Vercel passes Authorization: Bearer ${CRON_SECRET} on cron-triggered
 * calls. Same pattern as policy-renewals.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendApprovedCert } from '@/lib/sendApprovedCert';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const BATCH_LIMIT = 50;

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const t0 = Date.now();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error: readErr } = await admin
    .from('cert_requests')
    .select('id, cert_number')
    .eq('status', 'reviewed')
    .eq('auto_approve_lane', 'holdback')
    .is('intercepted_at', null)
    .lte('holdback_until', now)
    .order('holdback_until', { ascending: true })
    .limit(BATCH_LIMIT);

  if (readErr) {
    log.error('holdback_release.read_failed', { error: readErr.message });
    return NextResponse.json({ error: 'db error', detail: readErr.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, released: 0, durationMs: Date.now() - t0 });
  }

  let released = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const { data: flipped } = await admin
        .from('cert_requests')
        .update({
          status: 'approved',
          decided_by_email: 'system:holdback-release',
          decided_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'reviewed')
        .eq('auto_approve_lane', 'holdback')
        .is('intercepted_at', null)
        .select('id')
        .maybeSingle();
      if (!flipped) {
        log.info('holdback_release.skipped_already_decided', {
          requestId: row.id,
          certNumber: row.cert_number,
        });
        continue;
      }
      await sendApprovedCert(admin, row.id);
      released++;
      log.info('holdback_release.sent', {
        requestId: row.id,
        certNumber: row.cert_number,
      });
    } catch (err) {
      failed++;
      log.error('holdback_release.send_failed', {
        requestId: row.id,
        certNumber: row.cert_number,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    released,
    failed,
    candidates: due.length,
    durationMs: Date.now() - t0,
  });
}
