// @ts-nocheck — one-off CLI script; strict-mode noise not worth fixing.
/**
 * Cert-doctor CLI.
 *
 * Single gate before any coords.ts change ships. Runs all check chains,
 * emits a machine-readable JSON report, and exits 0 (PASS) or 1 (FAIL).
 *
 * Usage:
 *   npm run cert-doctor            — full check including render pass
 *   npm run cert-doctor -- --fast  — skip render pass (faster, misses rendered-overlap)
 *
 * Output:
 *   stdout: one-line summary + violation list
 *   out/doctor-report.json: full machine-readable report
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../lib/certDoctorCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const fast = process.argv.includes('--fast');

async function main(): Promise<void> {
  console.log(`\ncert-doctor — ACORD 25 overlay precision check`);
  console.log(`  mode: ${fast ? 'fast (no render pass)' : 'full'}\n`);

  const report = await runChecks({ skipRender: fast });

  // Print violations grouped by severity
  const errors = report.violations.filter((v) => v.severity === 'error');
  const warnings = report.violations.filter((v) => v.severity === 'warning');

  if (warnings.length > 0) {
    console.log(`⚠  Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`   [${w.check}]${w.field ? ' ' + w.field + ':' : ''} ${w.message}`);
      if (w.suggestion) console.log(`      → ${w.suggestion}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log(`✗  Errors (${errors.length}):`);
    for (const e of errors) {
      console.log(`   [${e.check}]${e.field ? ' ' + e.field + ':' : ''} ${e.message}`);
      if (e.suggestion) console.log(`      → ${e.suggestion}`);
    }
    console.log();
  }

  const { errors: errCount, warnings: warnCount, fieldsChecked, durationMs } = report.summary;
  const verdict = report.passed ? '✓  PASS' : '✗  FAIL';
  console.log(`${verdict} — ${fieldsChecked} fields, ${errCount} errors, ${warnCount} warnings (${durationMs}ms)\n`);

  // Write machine-readable report
  await mkdir(resolve(ROOT, 'out'), { recursive: true });
  const reportPath = resolve(ROOT, 'out/doctor-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`  Report: ${reportPath}`);

  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error('\ncert-doctor crashed:', err);
  process.exit(1);
});
