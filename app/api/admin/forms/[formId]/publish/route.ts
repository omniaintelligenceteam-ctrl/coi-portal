import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFormDef } from '@/lib/forms/loadFormDef';
import { runFormDoctor } from '@/lib/forms/formDoctor';
import { COI_ARCHIVE_BUCKET, formAnchorsStoragePath } from '@/lib/storage';
import type { AnchorLabel } from '@/lib/forms/drawCore';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Flip a draft form to published — making it appear in the registry list
 * as Live and eligible for per-client enablement.
 *
 * V1 publish check: the form must have at least one field mapped. Full
 * formDoctor checks (in-bounds, no-overlap, required-fields-covered) land
 * in Phase 4 alongside the ACORD 25 migration.
 *
 * Idempotent: republishing an already-published form is a no-op success.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { formId: raw } = await params;
  const formId = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const formDef = await loadFormDef(admin, formId);
  if (!formDef) {
    return NextResponse.json({ error: 'form not found' }, { status: 404 });
  }
  if (formDef.status === 'archived') {
    return NextResponse.json(
      { error: 'archived form cannot be published', detail: 'unarchive first' },
      { status: 409 },
    );
  }
  if (formDef.fields.length === 0) {
    return NextResponse.json(
      { error: 'no fields to publish', detail: 'add at least one field before publishing' },
      { status: 409 },
    );
  }

  // Load anchors for the doctor's bounds/overlap/missing-anchor checks. If
  // anchors aren't in storage (legacy code-registered form), pass an empty
  // array — the doctor will still run bounds + overlap on resolved absolute
  // coords, but anchor-relative fields can't be checked.
  let anchors: AnchorLabel[] = [];
  const anchorsDownload = await admin.storage
    .from(COI_ARCHIVE_BUCKET)
    .download(formAnchorsStoragePath(formId));
  if (anchorsDownload.data) {
    try {
      const parsed = JSON.parse(await anchorsDownload.data.text()) as { labels: AnchorLabel[] };
      anchors = parsed.labels ?? [];
    } catch {
      // ignore — doctor reports the missing-anchor errors directly
    }
  }

  // Run pre-flight checks. Errors block publish; warnings (e.g., overlap
  // hints) come through in the response so the UI can surface them.
  const doctor = await runFormDoctor(formDef, anchors, { admin });
  if (!doctor.ok) {
    return NextResponse.json(
      {
        error: 'doctor checks failed',
        detail: `${doctor.issues.filter((i) => i.severity === 'error').length} error(s) found`,
        issues: doctor.issues,
      },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from('form_templates')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', formId);

  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }

  log.info('form.published', {
    formId,
    by: email,
    fieldCount: formDef.fields.length,
    warningCount: doctor.issues.filter((i) => i.severity === 'warning').length,
  });
  return NextResponse.json({ ok: true, warnings: doctor.issues.filter((i) => i.severity === 'warning') });
}
