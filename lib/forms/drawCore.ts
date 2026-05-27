/**
 * Drawing primitives shared by the generic renderer.
 *
 * Why not import from lib/anchors.ts directly? Because lib/anchors.ts
 * bundle-imports the ACORD 25 anchors at module load (via the static
 * `import anchorsJson from '../assets/template-anchors.json'`). The
 * generic renderer needs to resolve against ARBITRARY anchors loaded
 * from Supabase storage at request time — a per-form anchors array
 * passed in as a function argument.
 *
 * The drawAt logic is copied from lib/fillAcord25.ts so the data-driven
 * renderer produces visually identical output to the legacy renderer
 * (shrink-to-fit, two-line fallback, skip-on-empty). Phase 4's
 * pixelmatch test locks this parity.
 */

import { rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import type { AnchorSide } from './types';

export const LINE_HEIGHT = 12;
export const DEFAULT_SIZE = 7.5;
const MIN_FONT_SIZE = 6.5;

export interface AnchorLabel {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedCoord {
  x: number;
  y: number;
  size: number;
  maxWidth?: number;
}

/**
 * Resolve an anchor-relative position to absolute (x, y) on the PDF page.
 * Mirrors lib/anchors.ts:resolveCoord but takes the anchors array as a
 * parameter instead of hardcoded ACORD 25 JSON.
 *
 * Throws if the anchor isn't in the labels array — callers should validate
 * upstream (formDoctor) before render to avoid runtime failures.
 */
export function resolveAnchorCoord(
  labels: readonly AnchorLabel[],
  anchorLabel: string,
  side: AnchorSide,
  dx: number,
  dy: number,
  nearY: number | null,
): { x: number; y: number } {
  const matches = labels.filter((l) => l.text === anchorLabel);
  if (matches.length === 0) {
    throw new Error(`drawCore: anchor not found: "${anchorLabel}"`);
  }

  // Disambiguate duplicate labels by nearY (e.g., EACH OCCURRENCE appears in
  // both GL and UMBRELLA rows).
  let anchor: AnchorLabel;
  if (matches.length > 1 && nearY != null) {
    anchor = matches.reduce((best, l) =>
      Math.abs(l.y - nearY) < Math.abs(best.y - nearY) ? l : best,
    );
  } else {
    anchor = matches[0]!;
  }

  switch (side) {
    case 'right':
      return { x: anchor.x + anchor.width + dx, y: anchor.y + dy };
    case 'left':
      return { x: anchor.x + dx, y: anchor.y + dy };
    case 'below':
      return { x: anchor.x + dx, y: anchor.y - LINE_HEIGHT + dy };
    case 'above':
      return { x: anchor.x + dx, y: anchor.y + LINE_HEIGHT + dy };
    case 'row':
      return { x: dx, y: anchor.y + dy };
    case 'inside':
      return { x: anchor.x + dx, y: anchor.y + dy };
  }
}

/**
 * Draw text at a resolved coordinate with shrink-to-fit + two-line fallback.
 * Mirrors lib/fillAcord25.ts:drawAt.
 *
 * Skips: empty string, 'none', 'n/a', 'na' (case-insensitive). This matches
 * the legacy renderer's behavior so an empty resolver doesn't draw the
 * placeholder text.
 */
export function drawAt(
  page: PDFPage,
  font: PDFFont,
  coord: ResolvedCoord,
  text: string,
): void {
  if (!text) return;
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'none' || trimmed === 'n/a' || trimmed === 'na') return;

  const maxWidth = coord.maxWidth;
  let size = coord.size;

  if (!maxWidth) {
    page.drawText(text, { x: coord.x, y: coord.y, size, font, color: rgb(0, 0, 0) });
    return;
  }

  // Step 1: fits at declared size?
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    page.drawText(text, { x: coord.x, y: coord.y, size, font, color: rgb(0, 0, 0), maxWidth });
    return;
  }

  // Step 2: shrink to fit.
  while (size > MIN_FONT_SIZE) {
    size -= 0.5;
    if (font.widthOfTextAtSize(text, size) <= maxWidth) {
      page.drawText(text, { x: coord.x, y: coord.y, size, font, color: rgb(0, 0, 0), maxWidth });
      return;
    }
  }

  // Step 3: split into two lines at MIN_FONT_SIZE.
  const words = text.split(' ');
  let line1 = '';
  let splitIdx = 0;
  for (let i = 0; i < words.length; i++) {
    const candidate = i === 0 ? words[0]! : line1 + ' ' + words[i]!;
    if (font.widthOfTextAtSize(candidate, MIN_FONT_SIZE) > maxWidth) break;
    line1 = candidate;
    splitIdx = i + 1;
  }
  const line2 = words.slice(splitIdx).join(' ');
  page.drawText(line1 || text, {
    x: coord.x,
    y: coord.y,
    size: MIN_FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
    maxWidth,
  });
  if (line2) {
    page.drawText(line2, {
      x: coord.x,
      y: coord.y - LINE_HEIGHT,
      size: MIN_FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
      maxWidth,
    });
  }
}
