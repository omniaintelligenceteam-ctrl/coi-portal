/**
 * ACORD 25 (Certificate of Liability Insurance, 2016/03 revision) form config.
 *
 * This wires the existing ACORD-25-specific implementation (lib/fillAcord25.ts,
 * lib/coords.ts, lib/certDoctorCore.ts) into the generic FormConfig shape
 * consumed by lib/forms/registry.ts and lib/renderCertificate.ts.
 *
 * Keeping the underlying files where they are (rather than moving them into
 * this directory) avoids breaking the dozens of script and test imports that
 * still reference lib/fillAcord25.ts etc. When form #2 lands and the
 * cert-doctor internals get parameterized, we'll consider whether moving the
 * ACORD-25-specific source files under this directory is worth the import-
 * churn. For now: thin adapter, zero file moves.
 */

import { resolve } from 'node:path';
import { fillAcord25 } from '../../fillAcord25';
import { runChecks } from '../../certDoctorCore';
import type { FormConfig } from '../types';

// Resolve template paths once at module load, relative to repo root.
// process.cwd() is the repo root in dev, in next-build, and in vitest.
const ROOT = process.cwd();

export const ACORD_25: FormConfig = {
  id: 'ACORD_25',
  displayName: 'Certificate of Liability Insurance',
  revision: '2016/03',
  templatePdfPath: resolve(ROOT, 'assets/acord-25-template.pdf'),
  templatePngPath: resolve(ROOT, 'assets/template/acord-25-page-1.png'),
  insurerSlotCount: 6,
  render: fillAcord25,
  doctor: runChecks,
};
