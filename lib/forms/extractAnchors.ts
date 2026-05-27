/**
 * PDF anchor extractor for form templates.
 *
 * Extracted from scripts/extractAnchors.ts so the visual-mapper upload
 * endpoint can call it on an in-memory Buffer. Returns the same shape the
 * CLI writes to assets/template-anchors.json — the mapper UI uses this
 * directly to render clickable label overlays on top of the rasterized PNG.
 *
 * For uploaded forms we keep the PDF's actual page dimensions (no 612x792
 * normalization the CLI does for ACORD 25). The Letter-vs-Legal distinction
 * matters for non-ACORD uploads, and the renderer uses these dims to size
 * the rendered PDF page.
 */

import { createHash } from 'node:crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface AnchorLabel {
  /** Trimmed text of the label as it appears in the PDF content stream. */
  text: string;
  /** Baseline-left x in PDF points (origin = bottom-left). */
  x: number;
  /** Baseline y in PDF points. */
  y: number;
  /** Rendered text width in PDF points. */
  width: number;
  /** Cap-height-ish text height in PDF points. */
  height: number;
}

export interface AnchorsFile {
  page_width: number;
  page_height: number;
  source_sha256: string;
  generated_at: string;
  labels: AnchorLabel[];
}

/**
 * Extract every static text label from page 1 of a PDF. Empty / whitespace-only
 * items are skipped. Labels are sorted top-to-bottom, left-to-right so multiple
 * extractions of the same PDF produce byte-identical JSON.
 */
export async function extractAnchors(pdfBuffer: Buffer | Uint8Array): Promise<AnchorsFile> {
  const bytes = pdfBuffer instanceof Buffer ? new Uint8Array(pdfBuffer) : pdfBuffer;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });

  const content = await page.getTextContent();
  const rawItems = content.items as Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>;

  const labels: AnchorLabel[] = [];
  for (const item of rawItems) {
    const text = item.str.trim();
    if (text === '') continue;
    labels.push({
      text,
      x: Number((item.transform[4] as number).toFixed(2)),
      y: Number((item.transform[5] as number).toFixed(2)),
      width: Number(item.width.toFixed(2)),
      height: Number(item.height.toFixed(2)),
    });
  }

  // Sort top-to-bottom, left-to-right for deterministic output across reruns.
  labels.sort((a, b) => {
    if (Math.abs(b.y - a.y) > 1) return b.y - a.y;
    return a.x - b.x;
  });

  const sha256 = createHash('sha256')
    .update(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer))
    .digest('hex');

  return {
    page_width: Number(viewport.width.toFixed(2)),
    page_height: Number(viewport.height.toFixed(2)),
    source_sha256: sha256,
    generated_at: new Date().toISOString(),
    labels,
  };
}
