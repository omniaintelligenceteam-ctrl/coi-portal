// @ts-nocheck — one-off probe; strict-mode noise not worth fixing.
/**
 * Probe: extract static label text + positions from the ACORD template PDF.
 *
 * The ACORD 25 fillable template has static labels ("INSURER A:", "POLICY NUMBER",
 * "EACH OCCURRENCE", etc.) baked into the page content stream — separate from
 * the XFA form layer. pdfjs can extract those positions.
 *
 * We then map our coord names to the nearest label and derive corrections.
 */

import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main(): Promise<void> {
  const bytes = await readFile('assets/acord-25-template.pdf');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  console.log(`Template page size: ${viewport.width} x ${viewport.height} pt`);
  const xScale = 612 / viewport.width;
  const yScale = 792 / viewport.height;
  console.log(`Scale to 612x792: x*=${xScale.toFixed(4)}, y*=${yScale.toFixed(4)}\n`);

  const content = await page.getTextContent();
  const items = content.items as Array<{ str: string; transform: number[] }>;

  const labels = [
    'PRODUCER', 'INSURED', 'CONTACT', 'PHONE', 'FAX', 'E-MAIL',
    'INSURER A', 'INSURER B', 'INSURER C', 'INSURER D', 'INSURER E', 'INSURER F',
    'NAIC',
    'COVERAGES', 'CERTIFICATE NUMBER',
    'COMMERCIAL GENERAL LIABILITY', 'AUTOMOBILE LIABILITY', 'UMBRELLA',
    'WORKERS COMPENSATION', 'OFFICER',
    'EACH OCCURRENCE', 'DAMAGE TO RENTED', 'MED EXP', 'PERSONAL & ADV',
    'GENERAL AGGREGATE', 'PRODUCTS', 'COMBINED SINGLE',
    'BODILY INJURY', 'PROPERTY DAMAGE',
    'EACH ACCIDENT', 'EACH OCCURRENCE',
    'DESCRIPTION OF OPERATIONS', 'CERTIFICATE HOLDER', 'CANCELLATION',
    'AUTHORIZED REPRESENTATIVE',
  ];

  console.log('Label positions on template (normalized to 612x792 page):');
  console.log('─'.repeat(80));

  for (const label of labels) {
    const matches = items.filter((i) => i.str.trim().toUpperCase().includes(label.toUpperCase()));
    if (matches.length === 0) continue;
    const sorted = matches.sort((a, b) => b.transform[5] - a.transform[5]); // top to bottom
    for (const m of sorted) {
      const x = m.transform[4] * xScale;
      const y = m.transform[5] * yScale;
      console.log(`y=${y.toFixed(2).padStart(7)} x=${x.toFixed(2).padStart(7)}  "${m.str.trim()}"`);
    }
  }

  // Also dump ALL static text items so we don't miss anything
  console.log('\n─'.repeat(80));
  console.log('All static text on template (sorted by y desc):');
  console.log('─'.repeat(80));
  const allSorted = [...items]
    .filter((i) => i.str.trim().length > 0)
    .sort((a, b) => b.transform[5] - a.transform[5]);
  for (const item of allSorted) {
    const x = item.transform[4] * xScale;
    const y = item.transform[5] * yScale;
    console.log(`y=${y.toFixed(2).padStart(7)} x=${x.toFixed(2).padStart(7)}  "${item.str.trim().slice(0, 50)}"`);
  }
  console.log(`\nTotal static text items: ${items.filter((i) => i.str.trim()).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
