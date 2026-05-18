/**
 * One-time ACORD 25 field-name discovery.
 *
 * Replaces the pdftk `dump_data_fields` approach from the plan. Uses @cantoo/pdf-lib
 * directly so there's no Windows-binary install required. Writes the field list to
 * `assets/acord-fields.json` for human inspection and as the source for `lib/fieldMap.ts`.
 *
 * Run: npm run discover-fields
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

type DiscoveredField = {
  name: string;
  type: string;
  exportValues?: string[]; // for checkboxes / radios
  options?: string[];      // for dropdowns
  maxLength?: number;      // for text fields
  isMultiline?: boolean;   // for text fields
  isReadOnly?: boolean;
};

async function main(): Promise<void> {
  const templatePath = resolve(ROOT, 'assets/acord-25-template.pdf');
  const bytes = await readFile(templatePath);
  // ACORD distributes the fillable PDF with encryption to discourage template modification.
  // Filling AcroForm fields is the legitimate intended use — bypass with ignoreEncryption.
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  console.log(`Loaded ${templatePath}`);
  console.log(`Total form fields: ${fields.length}\n`);

  const discovered: DiscoveredField[] = [];
  const nameCounts = new Map<string, number>();

  for (const field of fields) {
    const name = field.getName();
    const type = field.constructor.name;
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

    const entry: DiscoveredField = { name, type };

    // Pull extra metadata when available — best-effort, ignore errors per-field
    try {
      if (type === 'PDFTextField' && 'getMaxLength' in field) {
        const maxLen = (field as unknown as { getMaxLength: () => number | undefined }).getMaxLength();
        if (maxLen !== undefined) entry.maxLength = maxLen;
        const multiline = (field as unknown as { isMultiline: () => boolean }).isMultiline();
        entry.isMultiline = multiline;
      }
      if (type === 'PDFCheckBox' || type === 'PDFRadioGroup') {
        const opts = (field as unknown as { getOptions?: () => string[] }).getOptions?.();
        if (opts) entry.exportValues = opts;
      }
      if (type === 'PDFDropdown' || type === 'PDFOptionList') {
        const opts = (field as unknown as { getOptions?: () => string[] }).getOptions?.();
        if (opts) entry.options = opts;
      }
      const readOnly = (field as unknown as { isReadOnly?: () => boolean }).isReadOnly?.();
      if (readOnly) entry.isReadOnly = true;
    } catch {
      // Field type didn't expose this metadata — fine, keep going
    }

    discovered.push(entry);
  }

  // Flag duplicate field names — pdf-lib Issue #451 (if two widgets share a name, only one fills)
  const duplicates = [...nameCounts.entries()].filter(([_, n]) => n > 1);
  if (duplicates.length > 0) {
    console.warn('⚠️  DUPLICATE FIELD NAMES DETECTED (pdf-lib Issue #451):');
    for (const [name, n] of duplicates) {
      console.warn(`    "${name}" × ${n}`);
    }
    console.warn('    Multiple widgets share these names. setText() may only fill one widget.\n');
  } else {
    console.log('✓ No duplicate field names — pdf-lib Issue #451 does not apply.\n');
  }

  // Categorize for easier inspection
  const byType = new Map<string, DiscoveredField[]>();
  for (const f of discovered) {
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type)!.push(f);
  }

  console.log('Field counts by type:');
  for (const [type, fs] of byType) {
    console.log(`    ${type}: ${fs.length}`);
  }

  const output = {
    template: 'acord-25-template.pdf',
    generated_at: new Date().toISOString(),
    total_fields: fields.length,
    duplicates: duplicates.map(([name, count]) => ({ name, count })),
    fields: discovered.sort((a, b) => a.name.localeCompare(b.name)),
  };

  const outPath = resolve(ROOT, 'assets/acord-fields.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
