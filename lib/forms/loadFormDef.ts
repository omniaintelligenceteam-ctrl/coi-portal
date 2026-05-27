/**
 * Load a FormDef from Postgres.
 *
 * Joins form_templates + form_fields. Returns null when the form doesn't
 * exist; caller (renderCertificate, mapper UI, preview endpoint) decides
 * whether a missing form should fall back to the code-registered ACORD_25
 * or throw.
 *
 * Does NOT filter by status — drafts are loadable so the preview endpoint
 * can render them. The publish gate is enforced separately by
 * renderCertificate's dispatch (only status='published' forms reach the
 * production cert pipeline).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnchorSide, FormDef, FormFieldDef } from './types';

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

export async function loadFormDef(
  admin: SupabaseClient,
  formId: string,
): Promise<FormDef | null> {
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

  if (templateRes.error || !templateRes.data) return null;
  if (fieldsRes.error) throw new Error(`loadFormDef: failed to read form_fields: ${fieldsRes.error.message}`);

  const t = templateRes.data;
  return {
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
