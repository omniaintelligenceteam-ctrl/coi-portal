// @ts-nocheck — one-off CLI script; strict-mode noise not worth fixing.
/**
 * Cert-doctor CLI.
 *
 * Single gate before any coords.ts change ships. Runs all check chains for
 * the chosen form, emits a machine-readable JSON report, and exits 0 (PASS)
 * or 1 (FAIL).
 *
 * Usage:
 *   npm run cert-doctor                        — check default form (ACORD 25)
 *   npm run cert-doctor -- --form ACORD_25     — explicit form id
 *   npm run cert-doctor -- --form all          — check every registered form
 *   npm run cert-doctor -- --fast              — skip render pass (faster)
 *
 * Output:
 *   stdout: one-line summary + violation list per form
 *   out/doctor-report.json: full machine-readable report (last form checked
 *     when running --form all)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFormConfig, listFormIds, DEFAULT_FORM_ID } from '../lib/forms/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const fast = process.argv.includes('--fast');

// Parse `--form <id>` (or `--form=id`). Defaults to ACORD_25.
function parseFormFlag(): string {
  const argv = process.argv;
  const eqArg = argv.find((a) => a.startsWith('--form='));
  if (eqArg) return eqArg.slice('--form='.length);
  const idx = argv.indexOf('--form');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return DEFAULT_FORM_ID;
}

async function runOneForm(formId: string): Promise<boolean> {
  const config = getFormConfig(formId);
  console.log(`\ncert-doctor — ${config.id} (${config.displayName} ${config.revision}) overlay precision check`);
  console.log(`  mode: ${fast ? 'fast (no render pass)' : 'full'}\n`);

  const report = await config.doctor({ skipRender: fast });

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

  return report.passed;
}

async function main(): Promise<void> {
  const formArg = parseFormFlag();
  const formsToRun = formArg === 'all' ? [...listFormIds()] : [formArg];

  let allPassed = true;
  for (const id of formsToRun) {
    const passed = await runOneForm(id);
    if (!passed) allPassed = false;
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('\ncert-doctor crashed:', err);
  process.exit(1);
});
