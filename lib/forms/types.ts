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
}

// NOTE: The cert-doctor check suite (lib/certDoctorCore.runChecks) is
// intentionally NOT part of FormConfig. certDoctorCore imports test fixtures
// and uses .js extensions that Next.js webpack can't resolve, so pulling it
// into the registry would break `next build`. The CLI script
// (scripts/certDoctor.ts) imports runChecks directly. When form #2 lands and
// runChecks is parameterized per-form, switch the CLI to look up a doctor
// function in a separate, script-only registry (lib/forms/doctors.ts).

// =============================================================================
// Data-driven form definitions — the new path (Visual Mapper, Phase 0.2)
//
// FormConfig (above) is the legacy code-registered shape, kept around for the
// ACORD_25 fallback. FormDef + FormFieldDef are the runtime shapes loaded from
// form_templates + form_fields in Postgres — what the generic renderer walks.
// =============================================================================

/** Which edge of an anchor label to anchor a field to. Mirrors AnchorRef.side
 *  in lib/anchors.ts so coord resolution can stay shared. */
export type AnchorSide = 'right' | 'left' | 'below' | 'above' | 'row' | 'inside';

/** Form lifecycle status. Drafts live in the mapper; published forms are live
 *  in the registry; archived forms are hidden from new use but historical
 *  cert_requests with form_type set to an archived form still render. */
export type FormStatus = 'draft' | 'published' | 'archived';

/** One field's positioning + data source. Mirrors a row in the form_fields
 *  table (snake_case → camelCase). */
export interface FormFieldDef {
  readonly id: string;
  readonly formId: string;
  /** Stable key from lib/forms/fieldDictionary.ts, or 'custom_<n>' for
   *  free-form fields. The renderer looks this up to find a resolver fn. */
  readonly fieldKey: string;
  /** Dictionary lookup key OR a free-form expression. For dictionary fields
   *  this duplicates fieldKey; for custom fields it's a JSONPath-ish string. */
  readonly dataSource: string;
  readonly page: number;
  /** Null when the field uses absolute coords. */
  readonly anchorLabel: string | null;
  readonly anchorSide: AnchorSide | null;
  readonly dx: number;
  readonly dy: number;
  /** Set only when anchorLabel is null. */
  readonly absX: number | null;
  readonly absY: number | null;
  readonly fontSize: number;
  readonly maxWidthPt: number | null;
  /** Disambiguates when the PDF has duplicate label text (e.g., "POLICY NUMBER"
   *  appears 5 times on ACORD 25). */
  readonly nearY: number | null;
}

/** A loaded form definition — form_templates row + form_fields rows + storage
 *  URLs for the template assets. The output of lib/forms/loadFormDef.ts. */
export interface FormDef {
  readonly id: string;
  readonly displayName: string;
  readonly revision: string;
  readonly status: FormStatus;
  readonly pageCount: number;
  /** PDF page width in points. Null for legacy forms whose dimensions weren't
   *  recorded at upload (e.g., ACORD_25 pre-migration). */
  readonly pageWidthPt: number | null;
  readonly pageHeightPt: number | null;
  /** Storage paths (in the coi-archive bucket). Use lib/storage.ts to sign. */
  readonly templatePdfPath: string;
  readonly templatePngPath: string;
  readonly insurerSlotCount: number;
  readonly fields: readonly FormFieldDef[];
}
