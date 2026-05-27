import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * PUT  /api/admin/forms/[formId]/fields/[fieldId]
 *   Partial update of an existing form_field. All fields are optional;
 *   only-supplied keys are written. Same anchor/absolute coherency rules
 *   apply (enforced by DB CHECK constraint).
 *
 * DELETE /api/admin/forms/[formId]/fields/[fieldId]
 *   Hard delete (no soft-delete for fields — they're cheap to recreate).
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ANCHOR_SIDE = z.enum(['right', 'left', 'below', 'above', 'row', 'inside']);

const UpdateSchema = z.object({
  dataSource: z.string().min(1).max(200).optional(),
  page: z.number().int().min(1).optional(),
  anchorLabel: z.string().min(1).nullable().optional(),
  anchorSide: ANCHOR_SIDE.nullable().optional(),
  dx: z.number().optional(),
  dy: z.number().optional(),
  absX: z.number().nullable().optional(),
  absY: z.number().nullable().optional(),
  fontSize: z.number().positive().optional(),
  maxWidthPt: z.number().positive().nullable().optional(),
  nearY: z.number().nullable().optional(),
});

const COL_MAP: Record<keyof z.infer<typeof UpdateSchema>, string> = {
  dataSource: 'data_source',
  page: 'page',
  anchorLabel: 'anchor_label',
  anchorSide: 'anchor_side',
  dx: 'dx',
  dy: 'dy',
  absX: 'abs_x',
  absY: 'abs_y',
  fontSize: 'font_size',
  maxWidthPt: 'max_width_pt',
  nearY: 'near_y',
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string; fieldId: string }> },
) {
  const { formId: rawFormId, fieldId: rawFieldId } = await params;
  const formId = decodeURIComponent(rawFormId);
  const fieldId = decodeURIComponent(rawFieldId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [reqKey, dbCol] of Object.entries(COL_MAP) as Array<
    [keyof typeof COL_MAP, string]
  >) {
    const value = body[reqKey];
    if (value !== undefined) update[dbCol] = value;
  }

  // updated_at + nothing else == no-op
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('form_fields')
    .update(update)
    .eq('id', fieldId)
    .eq('form_id', formId); // belt-and-suspenders against URL tampering

  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }

  await admin
    .from('form_templates')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', formId);

  log.info('form_field.updated', { formId, fieldId, fields: Object.keys(update), by: email });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ formId: string; fieldId: string }> },
) {
  const { formId: rawFormId, fieldId: rawFieldId } = await params;
  const formId = decodeURIComponent(rawFormId);
  const fieldId = decodeURIComponent(rawFieldId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('form_fields')
    .delete()
    .eq('id', fieldId)
    .eq('form_id', formId);

  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }

  await admin
    .from('form_templates')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', formId);

  log.info('form_field.deleted', { formId, fieldId, by: email });
  return NextResponse.json({ ok: true });
}
