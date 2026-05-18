// @ts-nocheck — one-off codegen script; strict-mode noise not worth fixing.
/**
 * Anchor extraction script for the PDF Overlay Precision skill.
 *
 * Reads the source ACORD 25 fillable PDF and emits every STATIC label (text,
 * baseline x/y, width, height) into assets/template-anchors.json. Field
 * coordinates in lib/coords.ts reference these anchors by their text, then
 * apply (dx, dy) offsets — so when ACORD revises the template, regenerating
 * this JSON propagates the shift to every field anchored to a moved label.
 *
 * The ACORD template is XFA-only on the form layer, but its static labels
 * ("INSURER A :", "EACH OCCURRENCE", "CERTIFICATE NUMBER:", "WORKERS
 * COMPENSATION", etc.) live in the page content stream and ARE extractable
 * via pdfjs `getTextContent()`.
 *
 * Output shape:
 *   {
 *     "page_width": 612, "page_height": 792,
 *     "source": "assets/acord-25-template.pdf",
 *     "generated_at": "2026-05-18T...",
 *     "labels": [
 *       { "text": "INSURER A :", "x": 309.6, "y": 613.56, "width": 27.1, "height": 7.0 },
 *       ...
 *     ]
 *   }
 *
 * Run: npm run extract-anchors
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TEMPLATE_PATH = resolve(ROOT, 'assets/acord-25-template.pdf');
const OUT_PATH = resolve(ROOT, 'assets/template-anchors.json');

async function main(): Promise<void> {
  const bytes = await readFile(TEMPLATE_PATH);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });

  // The source template is 612x792 already (US Letter). Normalize anyway so the
  // file is robust against the rare ACORD revision that ships a slightly
  // different page size.
  const xScale = 612 / viewport.width;
  const yScale = 792 / viewport.height;

  const content = await page.getTextContent();
  const rawItems = content.items as Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>;

  // Each pdfjs text item's transform is [a, b, c, d, e, f] where (e, f) is the
  // text origin (baseline left). `width` is the rendered text width in PDF pts
  // at scale 1, `height` is the cap-height-ish text height.
  const labels: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];
  for (const item of rawItems) {
    const text = item.str.trim();
    if (text === '') continue;
    const rawX = item.transform[4];
    const rawY = item.transform[5];
    labels.push({
      text,
      x: Number((rawX * xScale).toFixed(2)),
      y: Number((rawY * yScale).toFixed(2)),
      width: Number((item.width * xScale).toFixed(2)),
      height: Number((item.height * yScale).toFixed(2)),
    });
  }

  // Sort top-to-bottom, left-to-right for deterministic JSON diffs across
  // re-runs. Without this, pdfjs draw-order shuffles produce noisy diffs.
  labels.sort((a, b) => {
    if (Math.abs(b.y - a.y) > 1) return b.y - a.y;
    return a.x - b.x;
  });

  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const out = {
    page_width: 612,
    page_height: 792,
    source: 'assets/acord-25-template.pdf',
    source_sha256: sha256,
    generated_at: new Date().toISOString(),
    labels,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');

  console.log(`✓ Wrote ${labels.length} labels to ${OUT_PATH}`);
  console.log(`  Page size: ${viewport.width.toFixed(2)} x ${viewport.height.toFixed(2)} pt`);
  console.log(`  Scaled to: 612 x 792`);
  console.log('\nNext: reference labels in lib/coords.ts as');
  console.log('  { anchor: "<exact text>", side: "right"|"left"|"below", dx, dy }');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
