import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * POST /api/admin/forms/[formId]/fields
 *
 * Insert a new form_field row. Anchored mode requires anchor_label + anchor_side;
 * absolute mode requires abs_x + abs_y. The DB CHECK constraint enforces this
 * (one or the other, never both, never neither) — we mirror it here for a clean
 * validation error before hitting the DB.
 *
 * field_key must be unique within form_id (DB constraint).
 *
 * For per-field updates and deletes, see ./[fieldId]/route.ts.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ANCHOR_SIDE = z.enum(['right', 'left', 'below', 'above', 'row', 'inside']);

const InputSchema = z
  .object({
    fieldKey: z.string().min(1).max(80),
    dataSource: z.string().min(1).max(200),
    page: z.number().int().min(1).default(1),
    anchorLabel: z.string().min(1).nullable().optional(),
    anchorSide: ANCHOR_SIDE.nullable().optional(),
    dx: z.number().default(0),
    dy: z.number().default(0),
    absX: z.number().nullable().optional(),
    absY: z.number().nullable().optional(),
    fontSize: z.number().positive().default(7.5),
    maxWidthPt: z.number().positive().nullable().optional(),
    nearY: z.number().nullable().optional(),
  })
  .refine(
    (d) =>
      (d.anchorLabel != null && d.anchorSide != null) ||
      (d.anchorLabel == null && d.absX != null && d.absY != null),
    { message: 'either (anchorLabel + anchorSide) OR (absX + absY) must be set' },
  );

export async function POST(req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
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

  let body: z.infer<typeof InputSchema>;
  try {
    body = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // form must exist and not be archived
  const { data: form, error: formErr } = await admin
    .from('form_templates')
    .select('id, status')
    .eq('id', formId)
    .maybeSingle();
  if (formErr) {
    return NextResponse.json({ error: 'db error', detail: formErr.message }, { status: 500 });
  }
  if (!form) return NextResponse.json({ error: 'form not found' }, { status: 404 });
  if (form.status === 'archived') {
    return NextResponse.json({ error: 'form is archived' }, { status: 409 });
  }

  const { data: inserted, error: insErr } = await admin
    .from('form_fields')
    .insert({
      form_id: formId,
      field_key: body.fieldKey,
      data_source: body.dataSource,
      page: body.page,
      anchor_label: body.anchorLabel ?? null,
      anchor_side: body.anchorSide ?? null,
      dx: body.dx,
      dy: body.dy,
      abs_x: body.absX ?? null,
      abs_y: body.absY ?? null,
      font_size: body.fontSize,
      max_width_pt: body.maxWidthPt ?? null,
      near_y: body.nearY ?? null,
    })
    .select('id')
    .single();

  if (insErr) {
    // 23505 = unique_violation → field_key already exists for this form
    if (insErr.code === '23505') {
      return NextResponse.json(
        { error: 'fieldKey already exists for this form', detail: body.fieldKey },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'db error', detail: insErr.message }, { status: 500 });
  }

  // bump updated_at on the parent form
  await admin
    .from('form_templates')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', formId);

  log.info('form_field.created', { formId, fieldId: inserted.id, fieldKey: body.fieldKey, by: email });

  return NextResponse.json({ ok: true, fieldId: inserted.id });
}
