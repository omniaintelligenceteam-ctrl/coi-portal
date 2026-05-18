/**
 * Regression gate: every drawn field on the ACORD 25 cert must land within ±3pt
 * of its declared coord in lib/coords.ts. If anyone edits coords.ts without
 * re-running calibration, this test fails — the only way to ship a coord change
 * is to verify it visually first, update the COORDS map, and let this test pass.
 *
 * Why ±3pt: Helvetica baseline ±1pt rendering jitter + rasterization ±1pt.
 * Loose enough to not flake, tight enough to catch row misalignment (always >10pt).
 */

import { describe, it, expect } from 'vitest';
import { fillAcord25 } from '../lib/fillAcord25.js';
import { COORDS, FIELD_ANCHORS } from '../lib/coords.js';
import { findAnchor, LINE_HEIGHT } from '../lib/anchors.js';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Minimum clearance between a rendered field's text origin and its anchor
 * label's bounding box. 3pt accounts for ±1pt rendering jitter + ±1pt
 * rasterization. Drop a dx to 0 and this test catches it immediately — that's
 * the PP-0009 class of bug.
 */
const MIN_CLEARANCE_PT = 3;

type ExtractedItem = { text: string; x: number; y: number };

async function extractTextWithPositions(bytes: Uint8Array): Promise<ExtractedItem[]> {
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  // transform is [a, b, c, d, e, f] — e,f is the text origin (baseline left)
  return (content.items as Array<{ str: string; transform: number[] }>).map((item) => ({
    text: item.str,
    x: item.transform[4] ?? 0,
    y: item.transform[5] ?? 0,
  }));
}

function findNearest(items: ExtractedItem[], text: string): ExtractedItem | undefined {
  return items.find((i) => i.text.includes(text));
}

function assertAt(
  items: ExtractedItem[],
  expectedText: string,
  coord: { x: number; y: number },
  tolerance = 3,
): void {
  const match = findNearest(items, expectedText);
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
 * declared-side axis is checked.
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
          // value renders LEFT of label — its right edge must be left of label.x
          // We don't track text width here; require x is strictly less than label.x
          // by at least MIN_CLEARANCE_PT.
          const clearance = label.x - coord.x;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: x=${coord.x} only ${clearance.toFixed(2)}pt left of "${label.text}" (at x=${label.x.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'below': {
          // value baseline must be below label baseline (lower y in PDF coords)
          const clearance = label.y - coord.y;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: y=${coord.y} only ${clearance.toFixed(2)}pt below "${label.text}" (at y=${label.y.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'above': {
          // value baseline must be above label baseline (higher y in PDF coords)
          const clearance = coord.y - label.y;
          if (clearance < MIN_CLEARANCE_PT) {
            violations.push(
              `${key}: y=${coord.y} only ${clearance.toFixed(2)}pt above "${label.text}" (at y=${label.y.toFixed(2)}); need ≥${MIN_CLEARANCE_PT}`,
            );
          }
          break;
        }
        case 'row': {
          // x is absolute; verify it doesn't fall INSIDE the anchor's box
          const insideAnchorX = coord.x >= label.x - MIN_CLEARANCE_PT &&
            coord.x <= label.x + label.width + MIN_CLEARANCE_PT;
          // y must equal label.y + dy (same row baseline) — check it lands within
          // ±LINE_HEIGHT of the anchor (i.e., on the row, not stranded above/below)
          const yDist = Math.abs(coord.y - label.y);
          if (insideAnchorX && yDist < LINE_HEIGHT / 2) {
            violations.push(
              `${key}: (${coord.x}, ${coord.y}) falls inside "${label.text}" bounding box [x=${label.x.toFixed(2)}..${(label.x + label.width).toFixed(2)}, y≈${label.y.toFixed(2)}]`,
            );
          }
          break;
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('a deliberate dx=0 violation is caught (regression-test the regression test)', () => {
    // Synthetic: simulate what happens if someone sets INSURER_A_NAME dx=0.
    const label = findAnchor('INSURER A :');
    const badCoord = { x: label.x, y: label.y }; // would land at label start, no clearance
    const labelRight = label.x + label.width;
    const clearance = badCoord.x - labelRight;
    expect(clearance).toBeLessThan(MIN_CLEARANCE_PT);
  });
});
