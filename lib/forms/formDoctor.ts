/**
 * Pre-flight checks for a form before it ships to production.
 *
 * Mirrors the spirit of certDoctor (which locks ACORD 25's coords) but
 * works against a data-driven FormDef instead of compile-time COORDS.
 *
 * Checks:
 *   - bounds         every field's resolved (x, y) sits inside the page
 *   - overlap        no two fields' bounding boxes overlap (per page)
 *   - missing_anchor every anchor_label still exists in the anchors set
 *   - render         synthetic-data render doesn't throw
 *
 * V1 surfaces issues but doesn't block publish — the publish endpoint can
 * choose to gate on ok===false. Phase 5 will surface findings inline in
 * the mapper UI.
 */

import { renderCertificateFromDb } from '../renderCertificate';
import { SYNTHETIC_COI_INPUT } from './syntheticInput';
import { resolveAnchorCoord, type AnchorLabel } from './drawCore';
import type { FormDef, FormFieldDef } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DoctorIssueSeverity = 'error' | 'warning';

export interface DoctorIssue {
  severity: DoctorIssueSeverity;
  check: 'bounds' | 'overlap' | 'missing_anchor' | 'render';
  fieldKey?: string;
  message: string;
}

export interface DoctorResult {
  ok: boolean;
  issues: DoctorIssue[];
}

/**
 * Run all checks against a FormDef + its anchors. The caller supplies the
 * anchors (loaded from storage) so we don't re-fetch them per check.
 *
 * `admin` is used for the synthetic-render check (it needs to fetch the
 * template PNG). Omit it to skip the render check (useful for offline
 * tests that don't have a live Supabase).
 */
export async function runFormDoctor(
  formDef: FormDef,
  anchors: readonly AnchorLabel[],
  options: { admin?: SupabaseClient } = {},
): Promise<DoctorResult> {
  const issues: DoctorIssue[] = [];
  const pageWidth = formDef.pageWidthPt ?? 612;
  const pageHeight = formDef.pageHeightPt ?? 792;

  // 1. Per-field resolution + bounds check + collect bounding boxes for overlap.
  const boxes: Array<{ field: FormFieldDef; x: number; y: number; w: number; h: number }> = [];

  for (const field of formDef.fields) {
    if (field.page !== 1) continue;

    let resolved: { x: number; y: number } | null = null;

    if (field.anchorLabel) {
      const present = anchors.some((a) => a.text === field.anchorLabel);
      if (!present) {
        issues.push({
          severity: 'error',
          check: 'missing_anchor',
          fieldKey: field.fieldKey,
          message: `Anchor "${field.anchorLabel}" no longer exists in the template's labels.`,
        });
        continue;
      }
      try {
        resolved = resolveAnchorCoord(
          anchors,
          field.anchorLabel,
          field.anchorSide!,
          field.dx,
          field.dy,
          field.nearY,
        );
      } catch (err) {
        issues.push({
          severity: 'error',
          check: 'missing_anchor',
          fieldKey: field.fieldKey,
          message: (err as Error).message,
        });
        continue;
      }
    } else {
      resolved = { x: field.absX!, y: field.absY! };
    }

    // Bounds check — give a margin of half the font size so a 7.5pt text that
    // ascends slightly past the page edge isn't flagged. (drawAt would still
    // draw it; this is about catching obvious off-page coords.)
    const fontSize = field.fontSize || 7.5;
    const margin = fontSize / 2;
    if (
      resolved.x < -margin ||
      resolved.x > pageWidth + margin ||
      resolved.y < -margin ||
      resolved.y > pageHeight + margin
    ) {
      issues.push({
        severity: 'error',
        check: 'bounds',
        fieldKey: field.fieldKey,
        message: `Resolved coord (${resolved.x.toFixed(1)}, ${resolved.y.toFixed(1)}) falls outside the page (${pageWidth}×${pageHeight}).`,
      });
      continue;
    }

    // Estimate a bounding box. Width = maxWidthPt (if set) or 60pt default.
    // Height ≈ font size. Origin (x, y) is the text baseline-left.
    const estWidth = field.maxWidthPt ?? 60;
    boxes.push({
      field,
      x: resolved.x,
      y: resolved.y - fontSize, // bottom of text bbox
      w: estWidth,
      h: fontSize + 2,
    });
  }

  // 2. Pairwise overlap check. O(n^2) — fine for <500 fields.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlaps =
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
      if (overlaps) {
        issues.push({
          severity: 'warning', // warning — could be an intentional sub-pt overlap
          check: 'overlap',
          fieldKey: `${a.field.fieldKey} ↔ ${b.field.fieldKey}`,
          message: `Bounding boxes of "${a.field.fieldKey}" and "${b.field.fieldKey}" overlap. Check spacing.`,
        });
      }
    }
  }

  // 3. Synthetic-data render check.
  if (options.admin) {
    try {
      await renderCertificateFromDb(options.admin, formDef.id, SYNTHETIC_COI_INPUT);
    } catch (err) {
      issues.push({
        severity: 'error',
        check: 'render',
        message: `Synthetic render failed: ${(err as Error).message}`,
      });
    }
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, issues };
}
