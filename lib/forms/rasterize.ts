/**
 * PDF → PNG rasterizer for form templates.
 *
 * Extracted from scripts/rasterizeTemplate.ts so the visual-mapper upload
 * endpoint can call it on an in-memory Buffer instead of requiring a file
 * path. The CLI script still uses this (via a thin wrapper) so a single
 * code path produces the PNGs whether they're written by the build step
 * (for ACORD_25's bundled template) or by an admin upload.
 *
 * Uses `pdf-to-img` (already in package.json). 300 DPI is the project
 * default — gives crisp text/lines on the rasterized background without
 * the file size of higher DPIs (Letter @ 300 DPI ≈ 2550×3300 px).
 */

import { pdf } from 'pdf-to-img';

export interface RasterizeResult {
  /** Pixel dimensions of page 1. Multi-page docs are assumed to have
   *  uniform page sizes — fine for ACORDs. */
  width: number;
  height: number;
  /** PNG bytes per page, in document order (page 1 = pngs[0]). */
  pngs: Buffer[];
}

export interface RasterizeOptions {
  /** Dots per inch. Default 300 (print quality). Pass 150 for previews. */
  dpi?: number;
}

/**
 * Rasterize every page of a PDF Buffer to PNG. Throws if the PDF can't be
 * parsed. Don't catch and swallow — let the caller decide whether to surface
 * the parse error to the admin or fall back to a placeholder.
 */
export async function rasterizePdfPages(
  pdfBuffer: Buffer | Uint8Array,
  options: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const dpi = options.dpi ?? 300;
  const scale = dpi / 72;

  // pdf-to-img accepts Uint8Array as well as file paths. Normalize.
  const input = pdfBuffer instanceof Buffer ? pdfBuffer : Buffer.from(pdfBuffer);
  const document = await pdf(input, { scale });

  const pngs: Buffer[] = [];
  let width = 0;
  let height = 0;

  for await (const page of document) {
    pngs.push(Buffer.from(page));
    // pdf-to-img doesn't expose dimensions on the page object directly, but
    // PNG bytes start with a fixed header followed by IHDR (width + height
    // big-endian uint32 at byte offset 16 + 20). Read once from page 1 — all
    // ACORD forms are uniform Letter dimensions.
    if (width === 0) {
      width = page.readUInt32BE(16);
      height = page.readUInt32BE(20);
    }
  }

  if (pngs.length === 0) {
    throw new Error('PDF rasterized to zero pages — upload may be corrupt');
  }

  return { width, height, pngs };
}
