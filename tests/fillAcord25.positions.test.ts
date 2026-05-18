/**
 * Regression gate: every drawn field on the ACORD 25 cert must land within ±3pt
 * of its declared coord in lib/coords.ts. If anyone edits coords.ts without
 * re-running calibration, this test fails — the only way to ship a coord change
 * is to verify it visually first, update the COORDS map, and let this test pass.
 *
 * Why ±3pt: Helvetica baseline ±1pt rendering jitter + rasterization ±1pt.
 * Loose enough to not flake, tight enough to catch row misalignment (always >10pt).
 *
 * Additional gates (Phase 1.8):
 *   - no-overlap (anchor clearance gate) — declared coord vs anchor label bbox
 *   - inside-region gate                 — region-anchored fields land inside their region
 *   - text-width overlap                 — full-bbox overlap using rendered text widths
 *   - field-to-field collision           — no two declared field bboxes overlap
 */

import { describe, it, expect } from 'vitest';
import { fillAcord25 } from '../lib/fillAcord25.js';
import { COORDS, FIELD_ANCHORS, DEFAULT_SIZE } from '../lib/coords.js';
import { findAnchor, isRegionAnchor, LINE_HEIGHT } from '../lib/anchors.js';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';
import {
  extractTextWithPositions,
  findRenderedText,
  textBBox,
  predictedTextBBox,
  bboxesOverlap,
  type ExtractedTextItem,
} from '../lib/pdfInspect.js';

/**
 * Minimum clearance between a rendered field's text origin and its anchor
 * label's bounding box. 3pt accounts for ±1pt rendering jitter + ±1pt
 * rasterization. Drop a dx to 0 and this test catches it immediately — that's
 * the PP-0009 class of bug.
 */
const MIN_CLEARANCE_PT = 3;

function assertAt(
  items: ExtractedTextItem[],
  expectedText: string,
  coord: { x: number; y: number },
  tolerance = 3,
): void {
  const match = findRenderedText(items, expectedText);
  if (!match) {
    throw new Error(`Expected text "${expectedText}" not found in rendered PDF.`);
  }
  expect(
    Math.abs(match.x - coord.x),
    `x for "${expectedText}": got ${match.x}, want ${coord.x} (±${tolerance})`,
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(match.y - coord.y),
    `y for "${expectedText}": got ${match.y}, want ${coord.y} (±${tolerance})`,
  ).toBeLessThanOrEqual(tolerance);
}

describe('fillAcord25 positions (regression gate)', () => {
  it('renders every fixed field within ±3pt of its declared coord', async () => {
    const bytes = await fillAcord25(SHEFFER_FIXTURE);
    const items = await extractTextWithPositions(bytes);

    // Header
    assertAt(items, '04/08/2026', COORDS.DATE);

    // Producer
    assertAt(items, 'The Policy Place', COORDS.PRODUCER_NAME);
    assertAt(items, '908 Poplar St', COORDS.PRODUCER_ADDRESS_1);

    // Contact
    assertAt(items, 'Brook Gaudy', COORDS.CONTACT_NAME);
    assertAt(items, '270-410-2015', COORDS.CONTACT_PHONE);
    assertAt(items, 'brook@yourpolicyplace.com', COORDS.CONTACT_EMAIL);

    // Insurers — A=Liberty Mutual, B=Great American (by fixture order)
    assertAt(items, 'Liberty Mutual', COORDS.INSURER_A_NAME);
    assertAt(items, '37206', COORDS.INSURER_A_NAIC);
    assertAt(items, 'Great American Insurance Company', COORDS.INSURER_B_NAME);
    assertAt(items, '16691', COORDS.INSURER_B_NAIC);

    // Insured
    assertAt(items, 'Evans Electric Inc', COORDS.INSURED_NAME);
    assertAt(items, '36 Louise Lane', COORDS.INSURED_ADDRESS_1);

    // Cert number
    assertAt(items, 'PP-20260408-0001', COORDS.CERT_NUMBER);

    // GL row
    assertAt(items, 'BKS68636367', COORDS.GL_POLICY_NUMBER);
    // Note: 02/10/2026 also appears for EQUIPMENT row; first match is GL
    // because the renderer draws GL before EQUIPMENT and items return in draw order.

    // WC row — find by unique policy number
    assertAt(items, 'WCF04252100', COORDS.WC_POLICY_NUMBER);
    assertAt(items, '06/08/2025', COORDS.WC_EFF_DATE);
    assertAt(items, '06/08/2026', COORDS.WC_EXP_DATE);

    // Equipment / OTHER row — unique description
    assertAt(items, 'Contractors Equipment Rented/Leased', COORDS.OTHER_DESCRIPTION);

    // Holder
    assertAt(items, 'Sheffer Construction & Development LLC', COORDS.HOLDER_NAME);
    assertAt(items, '1425 N. Royal Ave.', COORDS.HOLDER_ADDRESS_1);
    assertAt(items, 'Evansville', COORDS.HOLDER_ADDRESS_2);
  });

  it('does NOT render fax "none" sentinel value', async () => {
    const bytes = await fillAcord25(SHEFFER_FIXTURE);
    const items = await extractTextWithPositions(bytes);
    const fax = items.find((i) => i.text.toLowerCase().trim() === 'none');
    expect(fax, '"none" should be filtered out by drawAt — found at ' + JSON.stringify(fax)).toBeUndefined();
  });
});

/**
 * No-overlap regression gate.
 *
 * For every anchor-relative field declared in FIELD_ANCHORS, verify the
 * resolved COORDS position is at least MIN_CLEARANCE_PT clear of the anchor
 * label's bounding box on the declared side. This catches the PP-0009
 * class of bug: a field with dx=0 (or too small) that draws on top of its
 * own label.
 *
 * Why this is sufficient: the ±3pt positions test already proves rendered
 * positions match COORDS. So COORDS-vs-anchor clearance is a true proxy
 * for rendered-vs-anchor clearance.
 *
 * `row` and `above`/`below` sides intentionally allow x or y values that
 * sit "inside" the anchor's bounding box on the *other* axis — only the
 * declared-side axis is checked. `inside` is the opposite — the field
 * MUST land within the region's bounding box.
 */
describe('no-overlap (anchor clearance gate)', () => {
  const fields = Object.entries(FIELD_ANCHORS);

  it(`every anchor-relative field (${fields.length}) is at least ${MIN_CLEARANCE_PT}pt clear of its anchor label`, () => {
    const violations: string[] = [];
    for (const [key, ref] of fields) {
      const label = findAnchor(ref.anchor, ref.nearY);
      const coord = (COORDS as Record<string, { x: number; y: number }>)[key];
      if (!coord) {
        violations.push(`${key}: COORDS entry missing`);
        continue;
      }
      switch (ref.side) {
        case 'right': {
          const labelRight = label.x + label.width;
          const clearance = coord.x - labelRight;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: x=${coord.x} only ${clearance.toFixed(2)}pt right of "${label.text}" (ends at x=${labelRight.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'left': {
          const clearance = label.x - coord.x;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: x=${coord.x} only ${clearance.toFixed(2)}pt left of "${label.text}" (at x=${label.x.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'below': {
          const clearance = label.y - coord.y;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: y=${coord.y} only ${clearance.toFixed(2)}pt below "${label.text}" (at y=${label.y.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'above': {
          const clearance = coord.y - label.y;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: y=${coord.y} only ${clearance.toFixed(2)}pt above "${label.text}" (at y=${label.y.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'row': {
          const insideAnchorX = coord.x >= label.x - MIN_CLEARANCE_PT &&
            coord.x <= label.x + label.width + MIN_CLEARANCE_PT;
          const yDist = Math.abs(coord.y - label.y);
          if (insideAnchorX && yDist < LINE_HEIGHT / 2) {
            violations.push(
              `${key}: (${coord.x}, ${coord.y}) falls inside "${label.text}" bounding box [x=${label.x.toFixed(2)}..${(label.x + label.width).toFixed(2)}, y≈${label.y.toFixed(2)}]`,
            );
          }
          break;
        }
        case 'inside': {
          // For region anchors, the field MUST land inside the region's bbox.
          // The "violation" semantic flips: outside-the-region is the bug.
          const region = label;
          const inside =
            coord.x >= region.x &&
            coord.x <= region.x + region.width &&
            coord.y >= region.y &&
            coord.y <= region.y + region.height;
          if (!inside) {
            violations.push(
              `${key}: (${coord.x}, ${coord.y}) falls OUTSIDE region "${region.text}" bbox [x=${region.x}..${(region.x + region.width).toFixed(2)}, y=${region.y}..${(region.y + region.height).toFixed(2)}]`,
            );
          }
          break;
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('a deliberate dx=0 violation is caught (regression-test the regression test)', () => {
    const label = findAnchor('INSURER A :');
    const badCoord = { x: label.x, y: label.y };
    const labelRight = label.x + label.width;
    const clearance = badCoord.x - labelRight;
    expect(clearance).toBeLessThan(MIN_CLEARANCE_PT);
  });
});

/**
 * Text-width overlap gate (Phase 1.8 addition).
 *
 * The clearance gate above checks only the field's ORIGIN against the anchor
 * label's bbox on the DECLARED side. That misses two failure modes:
 *
 *   1. A long value's RENDERED right edge can cross back into a label that
 *      sits to its right (e.g., INSURER_A_NAME bleeding into INSURER_A_NAIC's
 *      column when the insurer name is unusually long).
 *   2. A value can overlap a NEIGHBORING label, not just its own anchor.
 *
 * We render the Sheffer fixture, compute each rendered text item's bbox using
 * pdfjs's reported width, and assert no field's bbox overlaps the anchor
 * label's bbox.
 */
describe('text-width overlap gate', () => {
  it('no rendered field bbox overlaps its anchor label bbox', async () => {
    const bytes = await fillAcord25(SHEFFER_FIXTURE);
    const items = await extractTextWithPositions(bytes);
    const violations: string[] = [];

    for (const [key, ref] of Object.entries(FIELD_ANCHORS)) {
      if (isRegionAnchor(ref.anchor)) continue; // regions are containers, not labels to clear
      const coord = (COORDS as Record<string, { x: number; y: number; size?: number }>)[key];
      if (!coord) continue;

      // Find the rendered text whose origin matches the field's coord within
      // tolerance. We can't search by text because we don't know the value
      // ahead of time; we search by position.
      const rendered = items.find(
        (i) => Math.abs(i.x - coord.x) <= MIN_CLEARANCE_PT && Math.abs(i.y - coord.y) <= MIN_CLEARANCE_PT,
      );
      if (!rendered) continue;

      const label = findAnchor(ref.anchor, ref.nearY);
      const labelBBox = { x: label.x, y: label.y, width: label.width, height: label.height };
      const fieldBBox = textBBox(rendered, coord.size ?? DEFAULT_SIZE);
      if (bboxesOverlap(fieldBBox, labelBBox)) {
        violations.push(
          `${key}: rendered "${rendered.text}" at (${rendered.x.toFixed(1)}, ${rendered.y.toFixed(1)}) w=${rendered.width.toFixed(1)} overlaps "${label.text}" bbox`,
        );
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});

/**
 * Field-to-field collision gate (Phase 1.8 addition).
 *
 * Two fields can each pass their individual anchor clearance check yet still
 * collide with each other (e.g., GL_POLICY_NUMBER and GL_EFF_DATE in the same
 * row). We compute every field's predicted bbox from COORDS + a typical
 * value width and assert no pair overlaps.
 *
 * Uses a synthetic "typical" string for each field rather than the fixture
 * value so the test catches regressions even when the Sheffer values happen
 * to be short.
 */
describe('field-to-field collision gate', () => {
  const SYNTHETIC_VALUES: Record<string, string> = {
    DATE: 'MM/DD/YYYY',
    CERT_NUMBER: 'PP-YYYYMMDD-XXXX',
    REVISION_NUMBER: 'PP-YYYYMMDD-XXXX',
    INSURER_A_NAIC: 'XXXXX',
    INSURER_B_NAIC: 'XXXXX',
    INSURER_C_NAIC: 'XXXXX',
    INSURER_D_NAIC: 'XXXXX',
    INSURER_E_NAIC: 'XXXXX',
    INSURER_F_NAIC: 'XXXXX',
    WC_OFFICER_YN: 'N',
    DESCRIPTION: 'X'.repeat(40),
  };

  function typicalValue(key: string, coord: { maxWidth?: number; size?: number }): string {
    if (key in SYNTHETIC_VALUES) return SYNTHETIC_VALUES[key]!;
    if (key.includes('INSR_LTR')) return 'A';
    if (key.includes('CHK')) return 'X';
    if (key.includes('DATE')) return 'MM/DD/YYYY';
    if (key.includes('LIMIT')) return '1,000,000';
    if (key.includes('POLICY_NUMBER')) return 'POLICY1234567';
    if (key.includes('NAME')) return 'Typical Company Name LLC';
    if (key.includes('ADDRESS')) return '123 Example Street, Townsville, ST 12345';
    if (key.includes('EMAIL')) return 'first.last@example.com';
    if (key.includes('PHONE') || key.includes('FAX')) return '555-555-5555';
    if (key.includes('DESCRIPTION')) return 'Some description text';
    // Default: half the maxWidth's worth of characters
    const size = coord.size ?? DEFAULT_SIZE;
    const charCount = Math.max(4, Math.floor((coord.maxWidth ?? 80) / (size * 0.5)));
    return 'X'.repeat(charCount);
  }

  it('no two declared fields produce overlapping bboxes with typical values', () => {
    const entries = Object.keys(FIELD_ANCHORS)
      .map((key) => {
        const coord = (COORDS as Record<string, { x: number; y: number; size?: number; maxWidth?: number }>)[key];
        if (!coord) return null;
        const value = typicalValue(key, coord);
        return { key, bbox: predictedTextBBox(coord, value) };
      })
      .filter((e): e is { key: string; bbox: ReturnType<typeof predictedTextBBox> } => e !== null);

    const violations: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!;
        const b = entries[j]!;
        if (bboxesOverlap(a.bbox, b.bbox)) {
          violations.push(
            `${a.key} ↔ ${b.key}: bboxes overlap (a=[${a.bbox.x.toFixed(1)},${a.bbox.y.toFixed(1)},w=${a.bbox.width.toFixed(1)}] b=[${b.bbox.x.toFixed(1)},${b.bbox.y.toFixed(1)},w=${b.bbox.width.toFixed(1)}])`,
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
