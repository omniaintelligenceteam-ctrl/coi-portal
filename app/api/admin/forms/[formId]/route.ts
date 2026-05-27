import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  COI_ARCHIVE_BUCKET,
  formTemplateStoragePath,
  formPagePngStoragePath,
  formAnchorsStoragePath,
} from '@/lib/storage';
import type { FormDef, FormFieldDef, AnchorSide } from '@/lib/forms/types';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET  → returns the FormDef (form_templates row + form_fields rows) plus
 *        signed URLs for the template PDF, page-1 PNG, and anchors JSON. Used
 *        by the mapper UI to populate its canvas and side panel.
 *
 * DELETE → soft-archive (status='archived'). Storage assets stay; historical
 *          cert_requests with form_type=<this> still render.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type TemplateRow = {
  id: string;
  display_name: string;
  revision: string;
  template_pdf_path: string;
  template_png_path: string;
  insurer_slot_count: number;
  status: 'draft' | 'published' | 'archived';
  page_count: number;
  page_width_pt: number | null;
  page_height_pt: number | null;
};

type FieldRow = {
  id: string;
  form_id: string;
  field_key: string;
  data_source: string;
  page: number;
  anchor_label: string | null;
  anchor_side: AnchorSide | null;
  dx: number;
  dy: number;
  abs_x: number | null;
  abs_y: number | null;
  font_size: number;
  max_width_pt: number | null;
  near_y: number | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 min — long enough for an editing session

export async function GET(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
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

  const [templateRes, fieldsRes] = await Promise.all([
    admin
      .from('form_templates')
      .select(
        'id, display_name, revision, template_pdf_path, template_png_path, insurer_slot_count, status, page_count, page_width_pt, page_height_pt',
      )
      .eq('id', formId)
      .maybeSingle<TemplateRow>(),
    admin
      .from('form_fields')
      .select(
        'id, form_id, field_key, data_source, page, anchor_label, anchor_side, dx, dy, abs_x, abs_y, font_size, max_width_pt, near_y',
      )
      .eq('form_id', formId)
      .order('field_key', { ascending: true })
      .returns<FieldRow[]>(),
  ]);

  if (templateRes.error) {
    return NextResponse.json({ error: 'db error', detail: templateRes.error.message }, { status: 500 });
  }
  if (!templateRes.data) {
    return NextResponse.json({ error: 'form not found' }, { status: 404 });
  }
  if (fieldsRes.error) {
    return NextResponse.json({ error: 'db error', detail: fieldsRes.error.message }, { status: 500 });
  }

  const t = templateRes.data;

  // Mint signed URLs for the three template assets. The mapper UI fetches the
  // PNG to render as background and the anchors JSON to overlay click targets.
  // Best-effort: if a path is missing in storage (e.g., ACORD_25 was registered
  // before the upload pipeline existed), return null so the UI can gracefully
  // explain "this form was registered in code; mapper unavailable".
  const [pdfUrl, pngUrl, anchorsUrl] = await Promise.all([
    signedUrlOrNull(admin, t.template_pdf_path),
    signedUrlOrNull(admin, t.template_png_path),
    signedUrlOrNull(admin, formAnchorsStoragePath(t.id)),
  ]);

  const formDef: FormDef = {
    id: t.id,
    displayName: t.display_name,
    revision: t.revision,
    status: t.status,
    pageCount: t.page_count,
    pageWidthPt: t.page_width_pt,
    pageHeightPt: t.page_height_pt,
    templatePdfPath: t.template_pdf_path,
    templatePngPath: t.template_png_path,
    insurerSlotCount: t.insurer_slot_count,
    fields: (fieldsRes.data ?? []).map(rowToFieldDef),
  };

  return NextResponse.json({
    formDef,
    signedUrls: {
      pdf: pdfUrl,
      png: pngUrl,
      anchors: anchorsUrl,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
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
  const { error } = await admin
    .from('form_templates')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', formId);

  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }

  log.info('form.archived', { formId, by: email });
  return NextResponse.json({ ok: true });
}

async function signedUrlOrNull(
  admin: ReturnType<typeof createAdminClient>,
  path: string,
): Promise<string | null> {
  // suppress: path may not exist for legacy forms registered in code
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(COI_ARCHIVE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function rowToFieldDef(r: FieldRow): FormFieldDef {
  return {
    id: r.id,
    formId: r.form_id,
    fieldKey: r.field_key,
    dataSource: r.data_source,
    page: r.page,
    anchorLabel: r.anchor_label,
    anchorSide: r.anchor_side,
    dx: r.dx,
    dy: r.dy,
    absX: r.abs_x,
    absY: r.abs_y,
    fontSize: r.font_size,
    maxWidthPt: r.max_width_pt,
    nearY: r.near_y,
  };
}
