// @ts-nocheck — one-off probe; strict-mode noise not worth fixing.
/**
 * Probe: extract text + positions from our own regenerated Sheffer PDF.
 * Compare extracted positions against the COORDS map to verify pdf-lib actually
 * draws where we tell it. Then we can cross-reference where they land on the
 * template PNG to derive the correct coord values empirically.
 */

import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { COORDS } from '../lib/coords.js';

async function main(): Promise<void> {
  const bytes = await readFile('out/sheffer-regenerated.pdf');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  console.log(`Regen PDF page size: ${viewport.width} x ${viewport.height} pt\n`);

  const content = await page.getTextContent();
  const items = content.items as Array<{ str: string; transform: number[] }>;
  console.log(`Total extracted text items: ${items.length}\n`);

  console.log('All text items (x, y, content):');
  console.log('─'.repeat(80));
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  for (const item of sorted) {
    const x = item.transform[4].toFixed(2);
    const y = item.transform[5].toFixed(2);
    console.log(`y=${y.padStart(7)} x=${x.padStart(7)}  "${item.str}"`);
  }

  console.log('\n─'.repeat(80));
  console.log('\nCOORDS reference (sorted by y descending):');
  console.log('─'.repeat(80));
  const coordsSorted = Object.entries(COORDS)
    .filter(([_, c]) => 'y' in c && !('width' in c))
    .sort((a, b) => (b[1] as any).y - (a[1] as any).y);
  for (const [key, coord] of coordsSorted) {
    const c = coord as { x: number; y: number };
    console.log(`y=${c.y.toString().padStart(4)} x=${c.x.toString().padStart(4)}  ${key}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
