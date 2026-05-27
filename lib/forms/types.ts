/**
 * Form registry types.
 *
 * A FormConfig describes everything the cert pipeline needs to render and
 * verify ONE insurance form (ACORD 25, ACORD 27, ACORD 125, etc.). The
 * registry in lib/forms/registry.ts owns the map; the pipeline (certPipeline,
 * issueCert, sendApprovedCert, voidCert, preview-cert) looks up the config by
 * formId and passes config-derived paths into the renderer.
 *
 * Adding a new form should not require touching the pipeline. It should only
 * require:
 *   1. Dropping the template PDF + rasterized page-1 PNG under assets/forms/<id>/
 *   2. Authoring the form's coords + fill function (when the form is complex,
 *      this lives in its own module under lib/forms/<id>/)
 *   3. Adding a FormConfig entry to the registry
 *   4. Seeding the form_templates row
 *
 * For now (Brook readiness, multi-form starting point) we have a single
 * FormConfig for ACORD 25 that delegates to the existing fillAcord25 +
 * certDoctorCore implementations. When form #2 lands we'll generalize the
 * doctor checks to be parameterized per-form; until then the doctor field
 * carries an `acord25Only` flag so a misconfigured second form can't silently
 * run ACORD 25's checks against its own template.
 */

import type { CoiInput } from '../types';

/** Result type re-export from cert-doctor core. */
export type { DoctorReport } from '../certDoctorCore';

export interface DoctorRunOptions {
  /** Skip the render-and-extract pass (faster, but loses rendered-overlap detection). */
  skipRender?: boolean;
}

export interface FormConfig {
  /** Stable identifier used in cert_requests.form_type and coi_clients.enabled_forms. */
  readonly id: string;

  /** Human-friendly name, e.g. "Certificate of Liability Insurance". */
  readonly displayName: string;

  /** ACORD revision tag, e.g. "2016/03". */
  readonly revision: string;

  /** Absolute path to the blank ACORD-issued template PDF (used for SHA256 verification). */
  readonly templatePdfPath: string;

  /** Absolute path to the rasterized page-1 PNG (used as render background). */
  readonly templatePngPath: string;

  /** Maximum number of distinct insurers the form can carry. ACORD 25 has 6 slots (A-F). */
  readonly insurerSlotCount: number;

  /**
   * Render a certificate of this form type from the provided CoiInput. For
   * forms that share the ACORD 25 input shape this can be `fillAcord25`
   * directly; for divergent forms each module exports its own renderer.
   */
  readonly render: (input: CoiInput) => Promise<Uint8Array>;

  /**
   * Run the cert-doctor check suite against this form. For ACORD 25 today,
   * this is the existing `runChecks` from lib/certDoctorCore (which is still
   * hardcoded to ACORD 25's COORDS/FIELD_ANCHORS internally — generalizing
   * those checks is deferred until form #2 lands).
   */
  readonly doctor: (opts?: DoctorRunOptions) => Promise<import('../certDoctorCore').DoctorReport>;
}
