// @ts-nocheck — one-off probe; strict-mode noise not worth fixing.
/**
 * One-off probe: extract text + position from the original hand-filled Sheffer COI.
 *
 * Use the extracted (x, y) positions as ground truth for calibrating lib/coords.ts.
 * The original Sheffer COI is the source of truth — that's where text is supposed
 * to land. Our renderer's job is to put the same strings at the same positions.
 *
 * Note: the original PDF may be slightly different page size (604.8 × 786.96)
 * than our render target (612 × 792). The script normalizes to our 612 × 792 page.
 *
 * Run: npx tsx scripts/probeSheffer.ts
 */

import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const SHEFFER_PATH = 'C:/Users/default.DESKTOP-ON29PVN/Downloads/Sheffer COI (1).pdf';

async function main(): Promise<void> {
  const bytes = await readFile(SHEFFER_PATH);
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: true,
  }).promise;
  console.log(`isPureXfa=${(pdf as any).isPureXfa}, allowedJSActions=${(pdf as any).allowedJSActions}`);
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  console.log(`Page size: ${viewport.width.toFixed(2)} x ${viewport.height.toFixed(2)} pt`);
  console.log(`Scale to 612 x 792: x*=${(612 / viewport.width).toFixed(4)}, y*=${(792 / viewport.height).toFixed(4)}\n`);

  const content = await page.getTextContent();
  const items = content.items as Array<{
    str: string;
    transform: number[];
  }>;

  // Also try annotations (XFA-backed widgets may surface here)
  const annots = await page.getAnnotations();
  console.log(`Annotations count: ${annots.length}`);
  for (const a of annots.slice(0, 5)) {
    console.log(`  annot: subtype=${a.subtype} fieldName=${a.fieldName} fieldValue=${JSON.stringify(a.fieldValue).slice(0, 60)} rect=${JSON.stringify(a.rect)}`);
  }
  console.log('');

  const xScale = 612 / viewport.width;
  const yScale = 792 / viewport.height;

  const targets = [
    '04/08/2026',                       // DATE
    'The Policy Place',                 // PRODUCER_NAME
    '908 Poplar St',                    // PRODUCER_ADDRESS_1
    'Benton, KY 42025',                 // PRODUCER_ADDRESS_2 (and possibly INSURED_ADDRESS_2)
    'Brook Gaudy',                      // CONTACT_NAME
    '270-410-2015',                     // CONTACT_PHONE
    'brook@yourpolicyplace.com',        // CONTACT_EMAIL
    'Liberty Mutual',                   // INSURER_A_NAME
    '37206',                            // INSURER_A_NAIC
    'Great American',                   // INSURER_B_NAME
    '16691',                            // INSURER_B_NAIC
    'Evans Electric',                   // INSURED_NAME
    '36 Louise Lane',                   // INSURED_ADDRESS_1
    'PP-',                              // CERT_NUMBER prefix
    'BKS68636367',                      // GL_POLICY_NUMBER (and EQUIPMENT_POLICY_NUMBER — both)
    '02/10/2026',                       // GL_EFF_DATE (and EQUIPMENT_EFF_DATE)
    '02/10/2027',                       // GL_EXP_DATE
    '1,000,000',                        // multiple limits
    '300,000',                          // GL_LIMIT_DAMAGE_RENT
    '5,000',                            // GL_LIMIT_MED_EXP
    '2,000,000',                        // GL_LIMIT_GEN_AGG / PROD_COMP_OP
    'WCF04252100',                      // WC_POLICY_NUMBER
    '06/08/2025',                       // WC_EFF_DATE
    '06/08/2026',                       // WC_EXP_DATE
    'Contractors Equipment',            // OTHER_DESCRIPTION
    '100,000',                          // OTHER_LIMIT
    'Sheffer',                          // HOLDER_NAME
    '1425',                             // HOLDER_ADDRESS_1
    'Evansville',                       // HOLDER_ADDRESS_2
  ];

  console.log('Found text items matching target strings (positions normalized to 612x792):');
  console.log('─'.repeat(90));
  console.log('text'.padEnd(40) + 'x'.padStart(8) + 'y'.padStart(8) + '   raw_x'.padStart(10) + '  raw_y'.padStart(10));
  console.log('─'.repeat(90));

  for (const target of targets) {
    const matches = items.filter((i) => i.str.includes(target));
    if (matches.length === 0) {
      console.log(`${target.padEnd(40)}  ⚠ NOT FOUND`);
      continue;
    }
    for (const m of matches) {
      const rawX = m.transform[4];
      const rawY = m.transform[5];
      const x = rawX * xScale;
      const y = rawY * yScale;
      console.log(
        `"${m.str.slice(0, 38)}"`.padEnd(40) +
        x.toFixed(2).padStart(8) +
        y.toFixed(2).padStart(8) +
        rawX.toFixed(2).padStart(10) +
        rawY.toFixed(2).padStart(10),
      );
    }
  }

  console.log('\n─'.repeat(90));
  console.log(`Total text items on page: ${items.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
