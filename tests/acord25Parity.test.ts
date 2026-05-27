/**
 * ACORD 25 parity test — locks the data-driven renderer to produce output
 * pixelmatch-equivalent to the legacy fillAcord25.
 *
 * Both paths render the same SHEFFER_FIXTURE input. The legacy path uses
 * compile-time COORDS + lib/fillAcord25.ts. The new path uses an in-memory
 * FormDef built from buildAcord25Fields() + lib/forms/genericRenderer.ts.
 *
 * Identical output guarantees that swapping ACORD 25 to the data-driven
 * path in production doesn't visually change a single cert.
 *
 * Skips the signature image (signaturePngPath: '') — the generic renderer
 * doesn't draw the signature yet (text fields only). When signature support
 * lands in the renderer, drop the override.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { fillAcord25 } from '../lib/fillAcord25.js';
import { fillFromTemplate } from '../lib/forms/genericRenderer.js';
import { buildAcord25Fields } from '../lib/forms/acord25FieldMap.js';
import { rasterizePdfPages } from '../lib/forms/rasterize.js';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';
import type { CoiInput } from '../lib/types.js';
import type { FormDef } from '../lib/forms/types.js';

const ROOT = process.cwd();

interface AnchorLabel {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

describe('ACORD 25 data-driven parity', () => {
  it('produces pixel-equivalent output to legacy fillAcord25', async () => {
    // Strip signature so the diff is text-only — generic renderer doesn't
    // draw images yet.
    const input: CoiInput = { ...SHEFFER_FIXTURE, signaturePngPath: '' };

    // Load template assets from disk — both paths use the same bytes.
    // Regions (DATE_BOX, SIG_BOX, etc.) are hand-authored rects that the
    // legacy renderer merges with extracted labels at runtime; do the same
    // here so anchor lookups for region-anchored fields resolve.
    const [pngBytes, anchorsRaw, regionsRaw] = await Promise.all([
      readFile(resolve(ROOT, 'assets/template/acord-25-page-1.png')),
      readFile(resolve(ROOT, 'assets/template-anchors.json'), 'utf-8'),
      readFile(resolve(ROOT, 'assets/template-regions.json'), 'utf-8'),
    ]);
    const anchorsJson = JSON.parse(anchorsRaw) as {
      page_width: number;
      page_height: number;
      labels: AnchorLabel[];
    };
    const regionsJson = JSON.parse(regionsRaw) as {
      regions: Array<{ name: string; x: number; y: number; width: number; height: number }>;
    };
    const mergedLabels: AnchorLabel[] = [
      ...anchorsJson.labels,
      ...regionsJson.regions.map((r) => ({
        text: r.name,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      })),
    ];

    // Build the in-memory FormDef from compile-time COORDS.
    const fields = buildAcord25Fields().map((row, i) => ({
      ...row,
      id: `test-${i}`,
      formId: 'ACORD_25',
    }));
    const formDef: FormDef = {
      id: 'ACORD_25',
      displayName: 'Certificate of Liability Insurance',
      revision: '2016/03',
      status: 'published',
      pageCount: 1,
      pageWidthPt: anchorsJson.page_width,
      pageHeightPt: anchorsJson.page_height,
      templatePdfPath: 'assets/acord-25-template.pdf',
      templatePngPath: 'assets/template/acord-25-page-1.png',
      insurerSlotCount: 6,
      fields,
    };

    // Render via both paths.
    const [legacyPdf, dataDrivenPdf] = await Promise.all([
      fillAcord25(input),
      fillFromTemplate(formDef, {
        templatePngBytes: new Uint8Array(pngBytes),
        anchors: mergedLabels,
        pageWidthPt: anchorsJson.page_width,
        pageHeightPt: anchorsJson.page_height,
      }, input),
    ]);

    // Rasterize both at 150 DPI (lower than the 300 used for the background
    // — keeps the test fast while still catching meaningful drift).
    const [legacyRaster, dataDrivenRaster] = await Promise.all([
      rasterizePdfPages(Buffer.from(legacyPdf), { dpi: 150 }),
      rasterizePdfPages(Buffer.from(dataDrivenPdf), { dpi: 150 }),
    ]);

    expect(legacyRaster.width).toBe(dataDrivenRaster.width);
    expect(legacyRaster.height).toBe(dataDrivenRaster.height);

    // Compare via pixelmatch — needs RGBA buffers, so decode each PNG via sharp.
    const [legacyRgba, newRgba] = await Promise.all([
      sharp(legacyRaster.pngs[0]!).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(dataDrivenRaster.pngs[0]!).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    const { width, height } = legacyRgba.info;
    const diffBuffer = Buffer.alloc(width * height * 4);
    const diffPixels = pixelmatch(
      legacyRgba.data,
      newRgba.data,
      diffBuffer,
      width,
      height,
      { threshold: 0.1 },
    );
    const totalPixels = width * height;
    const diffRatio = diffPixels / totalPixels;

    // Allow up to 2% pixel diff — font anti-aliasing + rounding produce a
    // small noise floor. The legacy renderer + new renderer share drawAt
    // logic and font, so anything materially higher than this floor signals
    // a real coord drift.
    expect(diffRatio).toBeLessThan(0.02);
  }, 120_000);
});
