import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rasterizePdfPages } from '@/lib/forms/rasterize';
import { extractAnchors } from '@/lib/forms/extractAnchors';
import { isKnownForm } from '@/lib/forms/registry';
import {
  COI_ARCHIVE_BUCKET,
  formTemplateStoragePath,
  formPagePngStoragePath,
  formAnchorsStoragePath,
} from '@/lib/storage';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
// Form templates can be a few MB each; raise the body cap.
export const maxDuration = 60;

/**
 * Upload a new form template.
 *
 * Multipart body:
 *   - pdf:         File          (the blank ACORD-style template)
 *   - formId:      string        (uppercase + underscores, e.g. 'ACORD_27')
 *   - displayName: string        (e.g. 'Evidence of Property Insurance')
 *   - revision:    string        (e.g. '2016/04')
 *
 * Pipeline:
 *   1. Validate uniqueness — formId must not exist in code registry or DB
 *   2. Rasterize page 1 at 300 DPI → PNG bytes
 *   3. Extract anchor labels via pdfjs → JSON
 *   4. Upload PDF, PNG, anchors to coi-archive/templates/<formId>/
 *   5. Insert form_templates row with status='draft'
 *
 * Returns: { formId, mapperUrl } — admin gets redirected to mapper UI to
 * place fields.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// formId: uppercase letters, digits, underscores. e.g. ACORD_27, CUSTOM_VENDOR_AGREEMENT.
const FORM_ID_RE = /^[A-Z][A-Z0-9_]{1,49}$/;

const InputSchema = z.object({
  formId: z
    .string()
    .regex(FORM_ID_RE, 'formId must be uppercase letters/digits/underscores, 2-50 chars'),
  displayName: z.string().min(2).max(120),
  revision: z.string().min(1).max(40),
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

  // Parse multipart form
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid multipart body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const pdfFile = form.get('pdf');
  if (!(pdfFile instanceof File)) {
    return NextResponse.json({ error: 'missing pdf file' }, { status: 400 });
  }
  if (pdfFile.type && pdfFile.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'pdf must be application/pdf', detail: `got ${pdfFile.type}` },
      { status: 400 },
    );
  }

  let body: z.infer<typeof InputSchema>;
  try {
    body = InputSchema.parse({
      formId: String(form.get('formId') ?? ''),
      displayName: String(form.get('displayName') ?? ''),
      revision: String(form.get('revision') ?? ''),
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // Uniqueness: not in code registry, not in DB.
  if (isKnownForm(body.formId)) {
    return NextResponse.json(
      { error: 'formId already registered in code', detail: body.formId },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  const { data: existing, error: lookupErr } = await admin
    .from('form_templates')
    .select('id')
    .eq('id', body.formId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: 'db error', detail: lookupErr.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      { error: 'formId already exists', detail: body.formId },
      { status: 409 },
    );
  }

  const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());

  // 1. Rasterize page 1 at 300 DPI
  let raster: Awaited<ReturnType<typeof rasterizePdfPages>>;
  try {
    raster = await rasterizePdfPages(pdfBuffer, { dpi: 300 });
  } catch (err) {
    log.warn('form_upload.rasterize_failed', { formId: body.formId, by: email, error: (err as Error).message });
    return NextResponse.json(
      { error: 'pdf rasterization failed', detail: (err as Error).message },
      { status: 422 },
    );
  }

  // 2. Extract anchors
  let anchors: Awaited<ReturnType<typeof extractAnchors>>;
  try {
    anchors = await extractAnchors(pdfBuffer);
  } catch (err) {
    log.warn('form_upload.extract_anchors_failed', { formId: body.formId, by: email, error: (err as Error).message });
    return NextResponse.json(
      { error: 'anchor extraction failed', detail: (err as Error).message },
      { status: 422 },
    );
  }

  // 3. Upload all three artifacts in parallel
  const pdfPath = formTemplateStoragePath(body.formId);
  const pngPath = formPagePngStoragePath(body.formId, 1);
  const anchorsPath = formAnchorsStoragePath(body.formId);

  const [pdfUp, pngUp, anchorsUp] = await Promise.all([
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true }),
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .upload(pngPath, raster.pngs[0]!, { contentType: 'image/png', upsert: true }),
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .upload(anchorsPath, Buffer.from(JSON.stringify(anchors, null, 2)), {
        contentType: 'application/json',
        upsert: true,
      }),
  ]);

  for (const result of [pdfUp, pngUp, anchorsUp]) {
    if (result.error) {
      return NextResponse.json(
        { error: 'storage upload failed', detail: result.error.message },
        { status: 500 },
      );
    }
  }

  // 4. Insert form_templates row with status='draft'
  const { error: insErr } = await admin.from('form_templates').insert({
    id: body.formId,
    display_name: body.displayName,
    revision: body.revision,
    template_pdf_path: pdfPath,
    template_png_path: pngPath,
    source_pdf_sha256: anchors.source_sha256,
    insurer_slot_count: 6, // ACORD default — can be edited later
    active: true,
    status: 'draft',
    page_count: raster.pngs.length,
    page_width_pt: anchors.page_width,
    page_height_pt: anchors.page_height,
    created_by_email: email,
  });

  if (insErr) {
    log.error('form_upload.insert_failed', { formId: body.formId, by: email, error: insErr.message });
    return NextResponse.json({ error: 'db insert failed', detail: insErr.message }, { status: 500 });
  }

  log.info('form.uploaded', {
    formId: body.formId,
    by: email,
    pageCount: raster.pngs.length,
    anchorCount: anchors.labels.length,
  });

  return NextResponse.json({
    formId: body.formId,
    mapperUrl: `/admin/forms/${encodeURIComponent(body.formId)}/edit`,
    anchorCount: anchors.labels.length,
    pageWidthPt: anchors.page_width,
    pageHeightPt: anchors.page_height,
  });
}
