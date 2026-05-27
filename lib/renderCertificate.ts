/**
 * Generic certificate-render entry point.
 *
 * Replaces the direct `fillAcord25(input)` calls scattered across the pipeline
 * (certPipeline, issueCert, sendApprovedCert, voidCert, preview-cert). Each
 * caller now passes a formId (typically from cert_requests.form_type, falling
 * back to DEFAULT_FORM_ID for new submissions before the DB row exists).
 *
 * The registry resolves formId → FormConfig and dispatches to the form-
 * specific render function. For ACORD 25 this is `fillAcord25`; for future
 * forms it's whatever renderer the form's module exports.
 */

import type { CoiInput } from './types';
import { getFormConfigOrDefault } from './forms/registry';

/**
 * Render a certificate PDF for the given formId. If formId is null/undefined,
 * falls back to DEFAULT_FORM_ID (ACORD_25).
 *
 * The CoiInput's `templatePngPath` should be set to the form's PNG path —
 * obtain that via `templatePngPathFor(formId)` before building the input, or
 * use `getFormConfig(formId).templatePngPath` directly.
 */
export async function renderCertificate(
  formId: string | null | undefined,
  input: CoiInput,
): Promise<Uint8Array> {
  const config = getFormConfigOrDefault(formId);
  return config.render(input);
}

/** Shortcut for obtaining a form's template PNG path before building a CoiInput. */
export function templatePngPathFor(formId: string | null | undefined): string {
  return getFormConfigOrDefault(formId).templatePngPath;
}

/** Shortcut for obtaining a form's insurer slot count (used by coiInputBuilder.letterMap). */
export function insurerSlotCountFor(formId: string | null | undefined): number {
  return getFormConfigOrDefault(formId).insurerSlotCount;
}

/**
 * Data-driven render path — loads the form's field map from Postgres and
 * fetches template assets from Supabase Storage, then dispatches to the
 * generic renderer.
 *
 * Currently used by /api/admin/forms/[formId]/preview. Phase 4 will route
 * issueCert through this path too (after the ACORD 25 migration + pixelmatch
 * parity test confirm the data-driven renderer produces byte-identical output
 * to fillAcord25). For now, issueCert and renderCertificate stay on the
 * code-registered FormConfig path.
 *
 * Throws if the form doesn't exist in form_templates, or if its template
 * assets can't be fetched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFormDef } from './forms/loadFormDef';
import { fillFromTemplate } from './forms/genericRenderer';
import { COI_ARCHIVE_BUCKET, formAnchorsStoragePath } from './storage';

export async function renderCertificateFromDb(
  admin: SupabaseClient,
  formId: string,
  input: CoiInput,
): Promise<Uint8Array> {
  const formDef = await loadFormDef(admin, formId);
  if (!formDef) {
    throw new Error(`renderCertificateFromDb: form not found: ${formId}`);
  }

  // Fetch template PNG bytes
  const pngDownload = await admin.storage
    .from(COI_ARCHIVE_BUCKET)
    .download(formDef.templatePngPath);
  if (pngDownload.error || !pngDownload.data) {
    throw new Error(
      `renderCertificateFromDb: failed to fetch template PNG (${formDef.templatePngPath}): ${pngDownload.error?.message ?? 'no data'}`,
    );
  }
  const templatePngBytes = new Uint8Array(await pngDownload.data.arrayBuffer());

  // Fetch anchors JSON
  const anchorsDownload = await admin.storage
    .from(COI_ARCHIVE_BUCKET)
    .download(formAnchorsStoragePath(formId));
  if (anchorsDownload.error || !anchorsDownload.data) {
    throw new Error(
      `renderCertificateFromDb: failed to fetch anchors for ${formId}: ${anchorsDownload.error?.message ?? 'no data'}`,
    );
  }
  const anchorsJson = JSON.parse(await anchorsDownload.data.text()) as {
    page_width: number;
    page_height: number;
    labels: Array<{ text: string; x: number; y: number; width: number; height: number }>;
  };

  return fillFromTemplate(
    formDef,
    {
      templatePngBytes,
      anchors: anchorsJson.labels,
      pageWidthPt: anchorsJson.page_width,
      pageHeightPt: anchorsJson.page_height,
    },
    input,
  );
}
