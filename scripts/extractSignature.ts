/**
 * One-time: extract Brook's signature from her existing Sheffer COI.
 *
 * Source: C:/Users/default.DESKTOP-ON29PVN/Downloads/Sheffer COI (1).pdf
 *
 * Workflow:
 *   1. Rasterize the source PDF page 1 to a high-resolution PNG (300 DPI).
 *   2. Crop the Authorized Representative box from the bottom-right of the cert.
 *   3. Threshold near-white pixels to transparent alpha so the signature
 *      composites cleanly over any background.
 *   4. Write assets/policy-place-signature.png.
 *
 * Run: npm run extract-signature
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Source PDF — Brook's already-signed Sheffer cert.
const SOURCE_PDF = 'C:/Users/default.DESKTOP-ON29PVN/Downloads/Sheffer COI (1).pdf';

// 300 DPI rasterization.
const DPI = 300;
const SCALE = DPI / 72;

// Sheffer source PDF is 604.8x786.96 PDF points (scanned slightly off-letter).
const PAGE_HEIGHT_PT = 786.96;

/**
 * Crop region in PDF points (bottom-left origin). Generous margins around
 * the Authorized Representative box — better to grab too much white then
 * threshold it away than to clip the signature glyph.
 */
const CROP_PDF = {
  x: 350,
  yBottom: 67,    // just above the AUTHORIZED REPRESENTATIVE box bottom border
  width: 150,
  height: 20,     // up to y=87 — clear of the label which sits at y≈92
};

// Whiteness threshold: any pixel with R, G, B all >= this becomes transparent.
const WHITE_THRESHOLD = 235;

async function main(): Promise<void> {
  console.log(`Source: ${SOURCE_PDF}`);
  const document = await pdf(SOURCE_PDF, { scale: SCALE });

  let pageBytes: Buffer | undefined;
  for await (const page of document) {
    pageBytes = page;
    break; // Page 1 only
  }
  if (!pageBytes) {
    throw new Error('Failed to rasterize page 1 of source PDF');
  }
  console.log(`✓ Rasterized page 1 at ${DPI} DPI (${pageBytes.length} bytes)`);

  // Convert PDF-points crop region to image-pixel crop region.
  // Image origin is top-left; PDF origin is bottom-left.
  const cropPx = {
    left:   Math.round(CROP_PDF.x * SCALE),
    top:    Math.round((PAGE_HEIGHT_PT - CROP_PDF.yBottom - CROP_PDF.height) * SCALE),
    width:  Math.round(CROP_PDF.width * SCALE),
    height: Math.round(CROP_PDF.height * SCALE),
  };
  console.log(`Crop region (px): ${JSON.stringify(cropPx)}`);

  const cropped = await sharp(pageBytes)
    .extract(cropPx)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Walk pixel data — near-white pixels become alpha=0.
  const { data, info } = cropped;
  const pixelCount = info.width * info.height;
  let whitened = 0;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4; // RGBA stride
    const r = data[off]!;
    const g = data[off + 1]!;
    const b = data[off + 2]!;
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[off + 3] = 0; // alpha
      whitened++;
    }
  }
  console.log(`✓ Made ${whitened}/${pixelCount} (${((whitened / pixelCount) * 100).toFixed(1)}%) pixels transparent`);

  const outBuffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  await mkdir(resolve(ROOT, 'assets'), { recursive: true });
  const outPath = resolve(ROOT, 'assets/policy-place-signature.png');
  await writeFile(outPath, outBuffer);
  console.log(`✓ Wrote ${outPath} (${outBuffer.length} bytes, ${info.width}x${info.height})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
