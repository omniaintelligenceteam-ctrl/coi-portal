/**
 * One-time: rasterize the ACORD 25 fillable PDF to a high-resolution PNG.
 *
 * Required because the official template is XFA-only with zero AcroForm widgets,
 * so we cannot fill fields by name. Instead we use the rasterized form as a
 * background and overlay text + signature at known coordinates via pdf-lib.
 *
 * Run: npm run rasterize
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdf } from 'pdf-to-img';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main(): Promise<void> {
  const templatePath = resolve(ROOT, 'assets/acord-25-template.pdf');
  // 300 DPI for print-quality background. Letter page = 8.5"x11" = 2550x3300 px at 300dpi.
  const document = await pdf(templatePath, { scale: 300 / 72 });

  await mkdir(resolve(ROOT, 'assets/template'), { recursive: true });

  let pageNum = 0;
  for await (const page of document) {
    pageNum++;
    const outPath = resolve(ROOT, `assets/template/acord-25-page-${pageNum}.png`);
    await writeFile(outPath, page);
    console.log(`✓ Wrote ${outPath} (${page.length} bytes)`);
  }

  console.log(`\nDone. ${pageNum} page(s) rasterized.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
