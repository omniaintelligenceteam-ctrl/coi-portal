/**
 * Diagnostic: can pdf-lib embed the XFA-only ACORD 25 template as a visual page
 * (without trying to read its form fields)?
 *
 * If yes, we use the render-on-top strategy: embed the template, draw text
 * at known coordinates, stamp signature, save. No XFA needed.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main(): Promise<void> {
  const templateBytes = await readFile(resolve(ROOT, 'assets/acord-25-template.pdf'));

  // Load source explicitly with ignoreEncryption — embedPdf's internal load() doesn't accept options
  const sourceDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

  // Create fresh doc — DON'T call getForm() on the source
  const newDoc = await PDFDocument.create();
  const font = await newDoc.embedFont(StandardFonts.Helvetica);

  // Embed first page from source as a visual page object
  const sourcePage = sourceDoc.getPage(0);
  const acordPage = await newDoc.embedPage(sourcePage);

  // Letter size in points
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const page = newDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Draw the ACORD template as background
  page.drawPage(acordPage, {
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  });

  // Draw a probe text overlay near the top-left to confirm overlay works
  page.drawText('OVERLAY PROBE', {
    x: 50,
    y: PAGE_HEIGHT - 50,
    size: 14,
    font,
    color: rgb(1, 0, 0),
  });

  const outBytes = await newDoc.save();
  await mkdir(resolve(ROOT, 'out'), { recursive: true });
  const outPath = resolve(ROOT, 'out/embed-probe.pdf');
  await writeFile(outPath, outBytes);
  console.log(`✓ Wrote ${outPath} (${outBytes.length} bytes)`);
  console.log('Open the file. If you see the ACORD 25 layout with red "OVERLAY PROBE" text at top-left, the render-on-top strategy works.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
