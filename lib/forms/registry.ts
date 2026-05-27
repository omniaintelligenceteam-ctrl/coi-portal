/**
 * Form registry — the single source of truth for "which forms can the portal
 * render". Joined to Supabase `form_templates` on the DB side (see migration
 * 20260526_0003_form_templates.sql).
 *
 * Lookup is by stable form ID (e.g. 'ACORD_25'). All cert pipeline call sites
 * (certPipeline, issueCert, sendApprovedCert, voidCert, preview-cert) go
 * through `getFormConfig(formId)` to obtain rendering paths + the render fn.
 *
 * Adding a new form:
 *   1. Create lib/forms/<id>/index.ts exporting a FormConfig
 *   2. Import it here and add to FORMS
 *   3. Seed a form_templates row with matching paths + SHA256
 */

import type { FormConfig } from './types';
import { ACORD_25 } from './acord25';

const FORMS: Readonly<Record<string, FormConfig>> = Object.freeze({
  [ACORD_25.id]: ACORD_25,
});

/** Default form when no formId is specified. Matches the DB default on cert_requests.form_type. */
export const DEFAULT_FORM_ID = ACORD_25.id;

export class UnknownFormError extends Error {
  constructor(public readonly formId: string) {
    super(
      `Unknown form_type: "${formId}". Known forms: ${Object.keys(FORMS).join(', ')}. ` +
        `Either register the form in lib/forms/registry.ts or fix the caller.`,
    );
    this.name = 'UnknownFormError';
  }
}

/**
 * Look up a form's config by ID. Throws UnknownFormError if not registered —
 * this is intentional: silently falling back to ACORD 25 would mean a cert
 * gets rendered with the wrong template if a typo slips through.
 */
export function getFormConfig(formId: string): FormConfig {
  const config = FORMS[formId];
  if (!config) throw new UnknownFormError(formId);
  return config;
}

/** Same as getFormConfig but defaults to ACORD_25 if formId is null/undefined/empty. */
export function getFormConfigOrDefault(formId: string | null | undefined): FormConfig {
  if (!formId) return getFormConfig(DEFAULT_FORM_ID);
  return getFormConfig(formId);
}

/** Returns true if the form is registered. Useful for validation at API boundaries. */
export function isKnownForm(formId: string): boolean {
  return formId in FORMS;
}

/** List all registered form configs (for admin UI form pickers, etc.). */
export function listForms(): readonly FormConfig[] {
  return Object.freeze(Object.values(FORMS));
}

/** List all registered form IDs. */
export function listFormIds(): readonly string[] {
  return Object.freeze(Object.keys(FORMS));
}
