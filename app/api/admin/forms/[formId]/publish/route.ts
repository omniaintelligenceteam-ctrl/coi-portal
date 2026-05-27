import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFormDef } from '@/lib/forms/loadFormDef';
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

  const { error } = await admin
    .from('form_templates')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', formId);

  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }

  log.info('form.published', { formId, by: email, fieldCount: formDef.fields.length });
  return NextResponse.json({ ok: true });
}
