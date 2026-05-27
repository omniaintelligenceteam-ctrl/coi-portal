import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeClientAudit } from '@/lib/clientAuditLog';
import { isKnownForm, DEFAULT_FORM_ID } from '@/lib/forms/registry';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Per-client form enablement toggle.
 *
 * Body: { formId: string, enabled: boolean }
 *   - formId must be registered in lib/forms/registry.ts
 *   - enabled=true → ensure formId is in coi_clients.enabled_forms
 *   - enabled=false → ensure it isn't
 *
 * Read-modify-write the text[] column (Supabase JS doesn't expose array_append /
 * array_remove). The race window matters in theory, but in practice Brook is the
 * only writer and she's not double-clicking toggles — so the trailing audit row
 * is the source of truth if conflicts ever arise.
 *
 * Audit: each toggle writes a 'updated' action with diff
 * `{ enabled_forms: { from: [...], to: [...] } }` so the client audit timeline
 * shows who flipped which form on/off and when.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  formId: z.string().min(1),
  enabled: z.boolean(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

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

  if (!isKnownForm(body.formId)) {
    return NextResponse.json(
      { error: 'unknown form', detail: `form_type "${body.formId}" is not registered` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Read current enabled_forms so we can compute a real diff (and avoid a
  // no-op write if the toggle is already in the desired state).
  const { data: before, error: readErr } = await admin
    .from('coi_clients')
    .select('id, enabled_forms')
    .eq('id', clientId)
    .maybeSingle<{ id: string; enabled_forms: string[] | null }>();

  if (readErr) {
    return NextResponse.json({ error: 'db error', detail: readErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  const current = new Set(before.enabled_forms ?? [DEFAULT_FORM_ID]);
  const desired = new Set(current);
  if (body.enabled) desired.add(body.formId);
  else desired.delete(body.formId);

  // No-op shortcut — already in desired state. Return ok so the UI doesn't
  // surface a confusing "nothing changed" error.
  if (current.size === desired.size && [...current].every((id) => desired.has(id))) {
    return NextResponse.json({ ok: true, enabled_forms: [...desired].sort() });
  }

  const nextArray = [...desired].sort();

  const { error: writeErr } = await admin
    .from('coi_clients')
    .update({ enabled_forms: nextArray })
    .eq('id', clientId);

  if (writeErr) {
    return NextResponse.json({ error: 'db error', detail: writeErr.message }, { status: 500 });
  }

  // Audit: record the array diff. FieldDiff is typed for primitives, so we
  // serialize both arrays to comma-joined strings — keeps the timeline
  // readable ("ACORD_25" → "ACORD_25, ACORD_27") without touching the audit
  // lib's type contract.
  const beforeStr = [...current].sort().join(', ') || '(none)';
  const afterStr = nextArray.join(', ') || '(none)';
  await writeClientAudit(admin, {
    clientId,
    action: 'updated',
    actorEmail: email,
    actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    diff: {
      enabled_forms: {
        from: beforeStr,
        to: afterStr,
      },
    },
  });

  log.info('client.forms_toggled', {
    clientId,
    formId: body.formId,
    enabled: body.enabled,
    by: email,
  });

  return NextResponse.json({ ok: true, enabled_forms: nextArray });
}
