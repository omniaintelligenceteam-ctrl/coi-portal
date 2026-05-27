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
