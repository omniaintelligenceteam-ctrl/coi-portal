/**
 * Shared PDF inspection helpers.
 *
 * Wraps pdfjs.getTextContent() into a typed, ergonomic API used by:
 *   - tests/fillAcord25.positions.test.ts (regression gate)
 *   - scripts/certDoctor.ts (full check chain)
 *   - scripts/cropDiff.ts (per-field visual diff)
 *
 * All extracted positions are in PDF points, baseline-left origin, exactly as
 * pdfjs reports them on a 612x792 page.
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface ExtractedTextItem {
  text: string;
  /** PDF-point x of the baseline-left text origin. */
  x: number;
  /** PDF-point y of the baseline-left text origin. */
  y: number;
  /** Rendered text width in PDF points (pdfjs item.width). */
  width: number;
  /** Cap-height-ish text height in PDF points (pdfjs item.height). */
  height: number;
}

/**
 * Extract every text item from page 1 of a PDF byte buffer with origin and
 * dimensions. Used to verify rendered field positions against COORDS.
 */
export async function extractTextWithPositions(bytes: Uint8Array): Promise<ExtractedTextItem[]> {
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  return (content.items as Array<{ str: string; transform: number[]; width: number; height: number }>).map(
    (item) => ({
      text: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? 0,
    }),
  );
}

/** Axis-aligned bounding box in PDF points (origin = bottom-left). */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box for a rendered text item. PDF text origin is baseline-left.
 * Metrics tuned for Helvetica: cap-height ≈ 0.7×em, descent ≈ 0.05×em (a
 * little less than the full descender depth, because most cert values
 * contain few descender glyphs and ACORD row spacing is tight).
 */
const HELVETICA_ASCENT_RATIO = 0.7;
const HELVETICA_DESCENT_RATIO = 0.05;

export function textBBox(item: ExtractedTextItem, size: number): BBox {
  const ascent = size * HELVETICA_ASCENT_RATIO;
  const descent = size * HELVETICA_DESCENT_RATIO;
  return {
    x: item.x,
    y: item.y - descent,
    width: item.width,
    height: ascent + descent,
  };
}

/**
 * Bounding box predicted for a field declaration before rendering. Used by
 * cert-doctor to detect overlap without first rendering — much faster than
 * pdfjs round-tripping.
 */
export function predictedTextBBox(coord: { x: number; y: number; size?: number }, text: string, charWidthRatio = 0.5): BBox {
  const size = coord.size ?? 7.5;
  const width = text.length * size * charWidthRatio;
  const ascent = size * HELVETICA_ASCENT_RATIO;
  const descent = size * HELVETICA_DESCENT_RATIO;
  return {
    x: coord.x,
    y: coord.y - descent,
    width,
    height: ascent + descent,
  };
}

export function bboxesOverlap(a: BBox, b: BBox): boolean {
  if (a.x + a.width <= b.x) return false;
  if (b.x + b.width <= a.x) return false;
  if (a.y + a.height <= b.y) return false;
  if (b.y + b.height <= a.y) return false;
  return true;
}

/** Signed overlap area (0 if disjoint). Useful for "how badly do they collide?" diagnostics. */
export function bboxOverlapArea(a: BBox, b: BBox): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

/**
 * Find a rendered text item whose .text includes the search string. First
 * match wins (draw order). Returns undefined if not found.
 */
export function findRenderedText(items: ExtractedTextItem[], needle: string): ExtractedTextItem | undefined {
  return items.find((i) => i.text.includes(needle));
}
