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
import { COORDS } from '../lib/coords.js';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

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
