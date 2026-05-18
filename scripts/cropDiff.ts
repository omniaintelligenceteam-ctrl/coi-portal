// @ts-nocheck — one-off diagnostic script; strict-mode noise not worth fixing.
/**
 * Per-field visual regression diff.
 *
 * Renders the Sheffer fixture to PNG via pdf-to-img, crops each field's
 * expected bbox using existing COORDS, and either:
 *
 *   --baseline  Write golden crops to assets/golden-crops/ (first-time setup).
 *   (default)   Compare each crop against the committed golden; fail on diff.
 *
 * Usage:
 *   npm run crop-diff -- --baseline   # first time: write goldens
 *   npm run crop-diff                 # subsequent: compare
 *
 * Why per-field crops instead of full-page diff:
 *   Full-page diff produces "pixels differ" — useless as a diagnostic. Per-field
 *   diff produces "INSURER_A_NAME: SSIM 0.71 (expected ≥0.95) — likely 4pt drift."
 *   That maps directly to the field and the fix.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { fillAcord25 } from '../lib/fillAcord25.js';
import { COORDS, FIELD_ANCHORS, DEFAULT_SIZE, PAGE_WIDTH, PAGE_HEIGHT } from '../lib/coords.js';
import { isRegionAnchor } from '../lib/anchors.js';
import { SHEFFER_FIXTURE } from '../tests/fixtures/sheffer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GOLDENS_DIR = resolve(ROOT, 'assets/golden-crops');
const RENDER_DPI = 150; // Lower than the rasterize DPI (300) — good enough for regression diffs
const SCALE = RENDER_DPI / 72; // PDF pt → PNG px
const PADDING_PX = 6; // Extra pixels around each crop for context

const baseline = process.argv.includes('--baseline');
const SSIM_THRESHOLD = 0.92; // Crops below this are flagged as drifted

async function pdfToSharp(pdfBytes: Uint8Array, tmpPath: string): Promise<sharp.Sharp> {
  await writeFile(tmpPath, pdfBytes);
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(tmpPath, { scale: SCALE });
  let page: Uint8Array | undefined;
  for await (const p of doc) {
    page = p; // Only need page 1
    break;
  }
  if (!page) throw new Error('pdf-to-img returned no pages');
  return sharp(page);
}

interface CropRegion {
  /** px coords on the rendered PNG */
  left: number;
  top: number;
  width: number;
  height: number;
}

function fieldCropRegion(coord: { x: number; y: number; size?: number; maxWidth?: number }): CropRegion {
  const size = coord.size ?? DEFAULT_SIZE;
  const maxWidth = coord.maxWidth ?? size * 15; // rough fallback
  const ascent = size * SCALE * 0.85;
  const descent = size * SCALE * 0.2;
  // PDF y is bottom-up; PNG y is top-down. Page height in px = PAGE_HEIGHT * SCALE.
  const pageHeightPx = PAGE_HEIGHT * SCALE;
  const left = Math.max(0, Math.floor(coord.x * SCALE - PADDING_PX));
  const topPdf = coord.y - descent / SCALE; // bottom of glyph in PDF pts
  const top = Math.max(0, Math.floor(pageHeightPx - (topPdf * SCALE + ascent + PADDING_PX)));
  const width = Math.min(
    Math.ceil(maxWidth * SCALE + PADDING_PX * 2),
    Math.floor(PAGE_WIDTH * SCALE) - left,
  );
  const height = Math.min(
    Math.ceil(ascent + descent + PADDING_PX * 2),
    Math.floor(pageHeightPx) - top,
  );
  return { left, top, width: Math.max(width, 10), height: Math.max(height, 10) };
}

async function goldenExists(key: string): Promise<boolean> {
  try {
    await access(resolve(GOLDENS_DIR, `${key}.png`));
    return true;
  } catch {
    return false;
  }
}

/** Compute a simple pixel-match similarity ratio (1.0 = identical). */
function computeSimilarity(a: Buffer, b: Buffer, width: number, height: number): number {
  const diff = new Uint8Array(width * height * 4);
  const numDiff = pixelmatch(
    new Uint8Array(a),
    new Uint8Array(b),
    diff,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );
  return 1 - numDiff / (width * height);
}

async function main(): Promise<void> {
  console.log(`\ncrop-diff — per-field visual regression`);
  console.log(`  mode: ${baseline ? 'baseline (writing goldens)' : 'compare'}`);
  console.log(`  DPI: ${RENDER_DPI}  SSIM threshold: ${SSIM_THRESHOLD}\n`);

  await mkdir(GOLDENS_DIR, { recursive: true });
  await mkdir(resolve(ROOT, 'out'), { recursive: true });

  const tmpPdf = resolve(ROOT, 'out/crop-diff-render.pdf');
  const pdfBytes = await fillAcord25(SHEFFER_FIXTURE);
  const img = await pdfToSharp(pdfBytes, tmpPdf);
  const imgMeta = await img.metadata();
  const pageWidthPx = imgMeta.width ?? Math.round(PAGE_WIDTH * SCALE);
  const pageHeightPx = imgMeta.height ?? Math.round(PAGE_HEIGHT * SCALE);
  const imgBuffer = await img.raw().toBuffer();

  const fields = Object.keys(FIELD_ANCHORS).filter((k) => !isRegionAnchor(FIELD_ANCHORS[k]!.anchor));

  let written = 0;
  let passed = 0;
  let failed = 0;
  const failures: Array<{ key: string; similarity: number }> = [];

  for (const key of fields) {
    const coord = (COORDS as Record<string, { x: number; y: number; size?: number; maxWidth?: number }>)[key];
    if (!coord) continue;

    const crop = fieldCropRegion(coord);
    // Clamp to actual page bounds
    if (crop.left >= pageWidthPx || crop.top >= pageHeightPx) continue;
    crop.width = Math.min(crop.width, pageWidthPx - crop.left);
    crop.height = Math.min(crop.height, pageHeightPx - crop.top);
    if (crop.width <= 0 || crop.height <= 0) continue;

    const cropBuffer = await sharp(imgBuffer, {
      raw: { width: pageWidthPx, height: pageHeightPx, channels: 4 },
    })
      .extract(crop)
      .png()
      .toBuffer();

    const goldenPath = resolve(GOLDENS_DIR, `${key}.png`);

    if (baseline) {
      await writeFile(goldenPath, cropBuffer);
      written++;
    } else {
      if (!(await goldenExists(key))) {
        console.log(`  skip  ${key} — no golden (run --baseline first)`);
        continue;
      }
      const goldenBuffer = await readFile(goldenPath);
      const goldenMeta = await sharp(goldenBuffer).metadata();

      if (goldenMeta.width !== crop.width || goldenMeta.height !== crop.height) {
        // Size mismatch — region changed, treat as fail
        failures.push({ key, similarity: 0 });
        console.log(`  FAIL  ${key} — crop size changed (expected ${goldenMeta.width}x${goldenMeta.height}, got ${crop.width}x${crop.height})`);
        failed++;
        continue;
      }

      const goldenRaw = await sharp(goldenBuffer).raw().toBuffer();
      const cropRaw = await sharp(cropBuffer).raw().toBuffer();
      const similarity = computeSimilarity(cropRaw, goldenRaw, crop.width, crop.height);

      if (similarity >= SSIM_THRESHOLD) {
        passed++;
      } else {
        failures.push({ key, similarity });
        console.log(`  FAIL  ${key} — similarity ${similarity.toFixed(3)} (need ≥${SSIM_THRESHOLD}). Likely coord drift.`);
        // Write the failing crop alongside the golden for visual inspection
        const failPath = resolve(ROOT, 'out', `crop-fail-${key}.png`);
        await writeFile(failPath, cropBuffer);
        console.log(`         actual crop: ${failPath}`);
        failed++;
      }
    }
  }

  if (baseline) {
    console.log(`✓  Wrote ${written} golden crops to ${GOLDENS_DIR}`);
    console.log(`   Commit assets/golden-crops/ to lock the visual baseline.`);
  } else {
    const verdict = failed === 0 ? '✓  PASS' : '✗  FAIL';
    console.log(`\n${verdict} — ${passed} passed, ${failed} failed out of ${passed + failed} fields checked`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('\ncrop-diff crashed:', err);
  process.exit(1);
});
