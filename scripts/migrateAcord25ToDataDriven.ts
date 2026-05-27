/**
 * Seed ACORD 25 form_fields rows from the legacy COORDS map.
 *
 * Run once after the Phase 0 migration applies. Idempotent: deletes
 * existing ACORD_25 form_fields rows before inserting fresh ones, so
 * re-running picks up any COORDS changes shipped since the last run.
 *
 * Also uploads the bundled template PDF, page-1 PNG, and anchors JSON to
 * the coi-archive bucket at templates/ACORD_25/* so the generic renderer
 * (which loads assets from storage) can render ACORD 25 from the DB-backed
 * path. The legacy fillAcord25 still uses local asset paths from the code
 * registry — both paths coexist until pixelmatch parity is proven.
 *
 * Run: npx tsx scripts/migrateAcord25ToDataDriven.ts
 */

// Env loaded via `node --env-file=.env.local` / `tsx --env-file=.env.local`.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildAcord25Fields } from '../lib/forms/acord25FieldMap';
import {
  COI_ARCHIVE_BUCKET,
  formTemplateStoragePath,
  formPagePngStoragePath,
  formAnchorsStoragePath,
} from '../lib/storage';

const FORM_ID = 'ACORD_25';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const ROOT = process.cwd();

  // 1. Build field rows from COORDS + FIELD_ANCHORS.
  const rows = buildAcord25Fields();
  console.log(`✓ Built ${rows.length} ACORD_25 field rows from lib/coords.ts`);

  // 2. Upload template artifacts to storage (used by the generic renderer
  //    when ACORD_25 is rendered via renderCertificateFromDb).
  const [pdfBytes, pngBytes, anchorsJson] = await Promise.all([
    readFile(resolve(ROOT, 'assets/acord-25-template.pdf')),
    readFile(resolve(ROOT, 'assets/template/acord-25-page-1.png')),
    readFile(resolve(ROOT, 'assets/template-anchors.json'), 'utf-8'),
  ]);

  const uploads = await Promise.all([
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .upload(formTemplateStoragePath(FORM_ID), pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      }),
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .upload(formPagePngStoragePath(FORM_ID, 1), pngBytes, {
        contentType: 'image/png',
        upsert: true,
      }),
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .upload(formAnchorsStoragePath(FORM_ID), anchorsJson, {
        contentType: 'application/json',
        upsert: true,
      }),
  ]);
  for (const u of uploads) {
    if (u.error) throw new Error(`Storage upload failed: ${u.error.message}`);
  }
  console.log(`✓ Uploaded template PDF, PNG, anchors to coi-archive/templates/${FORM_ID}/`);

  // 3. Update form_templates row to point at storage paths + page dims, so
  //    loadFormDef + renderCertificateFromDb resolve the right assets.
  const anchorsParsed = JSON.parse(anchorsJson) as { page_width: number; page_height: number };
  const { error: updErr } = await admin
    .from('form_templates')
    .update({
      template_pdf_path: formTemplateStoragePath(FORM_ID),
      template_png_path: formPagePngStoragePath(FORM_ID, 1),
      page_width_pt: anchorsParsed.page_width,
      page_height_pt: anchorsParsed.page_height,
      updated_at: new Date().toISOString(),
    })
    .eq('id', FORM_ID);
  if (updErr) throw new Error(`form_templates update failed: ${updErr.message}`);
  console.log(`✓ Updated form_templates row for ${FORM_ID}`);

  // 4. Delete + insert form_fields rows (idempotent re-run).
  const { error: delErr } = await admin.from('form_fields').delete().eq('form_id', FORM_ID);
  if (delErr) throw new Error(`form_fields delete failed: ${delErr.message}`);

  const insertPayload = rows.map((r) => ({
    form_id: FORM_ID,
    field_key: r.fieldKey,
    data_source: r.dataSource,
    page: r.page,
    anchor_label: r.anchorLabel,
    anchor_side: r.anchorSide,
    dx: r.dx,
    dy: r.dy,
    abs_x: r.absX,
    abs_y: r.absY,
    font_size: r.fontSize,
    max_width_pt: r.maxWidthPt,
    near_y: r.nearY,
  }));
  const { error: insErr } = await admin.from('form_fields').insert(insertPayload);
  if (insErr) throw new Error(`form_fields insert failed: ${insErr.message}`);
  console.log(`✓ Inserted ${insertPayload.length} form_fields rows for ${FORM_ID}`);

  console.log('\nDone. Verify with: select count(*) from form_fields where form_id = \'ACORD_25\';');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
