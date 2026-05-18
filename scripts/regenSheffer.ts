/**
 * Regenerate the Sheffer COI sample as a real PDF.
 *
 * Output: out/sheffer-regenerated.pdf
 * Use: open side-by-side with the original (~/Downloads/Sheffer COI.pdf) for visual diff.
 * Iterate coords in lib/coords.ts until matched.
 *
 * Run: npm run regen-sheffer
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillAcord25 } from '../lib/fillAcord25.js';
import { SHEFFER_FIXTURE } from '../tests/fixtures/sheffer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main(): Promise<void> {
  const pdfBytes = await fillAcord25(SHEFFER_FIXTURE);
  await mkdir(resolve(ROOT, 'out'), { recursive: true });
  const outPath = resolve(ROOT, 'out/sheffer-regenerated.pdf');
  await writeFile(outPath, pdfBytes);
  console.log(`✓ Wrote ${outPath} (${pdfBytes.length} bytes)`);
  console.log(`\nOpen side-by-side with: C:/Users/default.DESKTOP-ON29PVN/Downloads/Sheffer COI.pdf`);
  console.log(`Tune coordinates in lib/coords.ts and re-run until matched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
