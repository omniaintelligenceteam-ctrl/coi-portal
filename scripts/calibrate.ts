/**
 * Coordinate calibration tool.
 *
 * Renders the ACORD 25 template PNG with red crosshairs + labels at every coord
 * from lib/coords.ts. Use this to spot which fields are misaligned against the
 * Sheffer COI sample without doing the math by hand.
 *
 * Workflow:
 *   1. Run `npm run calibrate`
 *   2. Open out/calibration.pdf side-by-side with ~/Downloads/Sheffer COI.pdf
 *   3. Each red dot + label shows where a field will draw. Adjust lib/coords.ts.
 *   4. Re-run until the dots fall where the original Sheffer text falls.
 *
 * Run: npm run calibrate
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { COORDS, PAGE_WIDTH, PAGE_HEIGHT } from '../lib/coords.js';
import { listAnchors } from '../lib/anchors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main(): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Background: ACORD template
  const templateBytes = await readFile(resolve(ROOT, 'assets/template/acord-25-page-1.png'));
  const templateImage = await pdfDoc.embedPng(templateBytes);
  page.drawImage(templateImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });

  // Paint anchor label boxes FIRST (under field crosshairs) — faint blue
  // outline around each static label from template-anchors.json. Any red
  // field dot that lands INSIDE a blue box means the value will overlap its
  // label when rendered — same visual diagnosis as the no-overlap test.
  for (const label of listAnchors()) {
    page.drawRectangle({
      x: label.x,
      y: label.y - 1,
      width: label.width,
      height: Math.max(label.height, 7),
      borderColor: rgb(0.4, 0.6, 1.0),
      borderWidth: 0.25,
    });
  }

  // Draw a crosshair + label at each coord
  for (const [key, coord] of Object.entries(COORDS)) {
    if ('width' in coord) {
      // Image-style coord (SIGNATURE) — draw a rectangle outline
      page.drawRectangle({
        x: coord.x,
        y: coord.y,
        width: coord.width,
        height: coord.height,
        borderColor: rgb(1, 0, 0),
        borderWidth: 0.5,
      });
      page.drawText(key, {
        x: coord.x,
        y: coord.y + coord.height + 2,
        size: 5,
        font,
        color: rgb(1, 0, 0),
      });
    } else {
      // Text-style coord — small red dot + key label
      page.drawCircle({ x: coord.x, y: coord.y, size: 1.2, color: rgb(1, 0, 0) });
      page.drawText(key, {
        x: coord.x + 2,
        y: coord.y - 1,
        size: 4,
        font,
        color: rgb(0.8, 0, 0),
      });
    }
  }

  // Margin ruler — vertical points indicator every 50pt for visual reference
  for (let y = 0; y <= PAGE_HEIGHT; y += 50) {
    page.drawText(`y=${y}`, { x: 2, y, size: 4, font, color: rgb(0, 0.5, 0) });
    page.drawLine({
      start: { x: 18, y },
      end: { x: 22, y },
      thickness: 0.3,
      color: rgb(0, 0.5, 0),
    });
  }
  for (let x = 0; x <= PAGE_WIDTH; x += 50) {
    page.drawText(`${x}`, { x, y: 2, size: 4, font, color: rgb(0, 0.5, 0) });
    page.drawLine({
      start: { x, y: 18 },
      end: { x, y: 22 },
      thickness: 0.3,
      color: rgb(0, 0.5, 0),
    });
  }

  await mkdir(resolve(ROOT, 'out'), { recursive: true });
  const outPath = resolve(ROOT, 'out/calibration.pdf');
  await writeFile(outPath, await pdfDoc.save());
  console.log(`✓ Wrote ${outPath}`);
  console.log(`\nLegend:`);
  console.log(`  blue box = static label from template-anchors.json (the anchor)`);
  console.log(`  red dot  = field text origin (resolved from lib/coords.ts)`);
  console.log(`  red rect = signature image bounds`);
  console.log(`  green ruler = y/x point grid every 50pt`);
  console.log(`\nA red dot inside a blue box means the value will overlap its label —`);
  console.log(`adjust the field's dx/dy in lib/coords.ts. Re-run npm run calibrate`);
  console.log(`until every red dot sits clear of its anchor box on the declared side.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
