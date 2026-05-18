/**
 * Cert-doctor check engine.
 *
 * Single source of truth for the gates that block a coords.ts change from
 * shipping. The Vitest suite at tests/fillAcord25.positions.test.ts is the
 * CI gate; this module is the same logic invokable from the CLI for fast
 * feedback during calibration loops, plus extra checks the test suite
 * doesn't do (template hash, page-bounds, synthetic-value field-collision).
 *
 * Returns a structured report; doesn't print or exit. The CLI wrapper at
 * scripts/certDoctor.ts handles I/O.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { COORDS, FIELD_ANCHORS, DEFAULT_SIZE, PAGE_WIDTH, PAGE_HEIGHT, type Coord } from './coords.js';
import {
  findAnchor,
  isRegionAnchor,
  MissingAnchorError,
  LINE_HEIGHT,
  type AnchorRef,
} from './anchors.js';
import {
  extractTextWithPositions,
  textBBox,
  predictedTextBBox,
  bboxesOverlap,
  type BBox,
} from './pdfInspect.js';
import { fillAcord25 } from './fillAcord25.js';
import { SHEFFER_FIXTURE } from '../tests/fixtures/sheffer.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JSON import for SHA lookup
import anchorsJson from '../assets/template-anchors.json' assert { type: 'json' };

export type Severity = 'error' | 'warning';

export interface Violation {
  severity: Severity;
  check: string;
  field?: string;
  message: string;
  suggestion?: string;
}

export interface DoctorReport {
  passed: boolean;
  violations: Violation[];
  summary: {
    totalChecks: number;
    fieldsChecked: number;
    errors: number;
    warnings: number;
    durationMs: number;
  };
}

const MIN_CLEARANCE_PT = 3;

const SYNTHETIC_VALUES: Record<string, string> = {
  DATE: 'MM/DD/YYYY',
  CERT_NUMBER: 'PP-YYYYMMDD-XXXX',
  REVISION_NUMBER: 'PP-YYYYMMDD-XXXX',
  INSURER_A_NAIC: 'XXXXX',
  INSURER_B_NAIC: 'XXXXX',
  INSURER_C_NAIC: 'XXXXX',
  INSURER_D_NAIC: 'XXXXX',
  INSURER_E_NAIC: 'XXXXX',
  INSURER_F_NAIC: 'XXXXX',
  WC_OFFICER_YN: 'N',
  DESCRIPTION: 'X'.repeat(40),
};

function typicalValue(key: string, coord: { maxWidth?: number; size?: number }): string {
  if (key in SYNTHETIC_VALUES) return SYNTHETIC_VALUES[key]!;
  if (key.includes('INSR_LTR')) return 'A';
  if (key.includes('CHK')) return 'X';
  if (key.includes('DATE')) return 'MM/DD/YYYY';
  if (key.includes('LIMIT')) return '1,000,000';
  if (key.includes('POLICY_NUMBER')) return 'POLICY1234567';
  if (key.includes('NAME')) return 'Typical Company Name LLC';
  if (key.includes('ADDRESS')) return '123 Example Street, Townsville, ST 12345';
  if (key.includes('EMAIL')) return 'first.last@example.com';
  if (key.includes('PHONE') || key.includes('FAX')) return '555-555-5555';
  if (key.includes('DESCRIPTION')) return 'Some description text';
  const size = coord.size ?? DEFAULT_SIZE;
  const charCount = Math.max(4, Math.floor((coord.maxWidth ?? 80) / (size * 0.5)));
  return 'X'.repeat(charCount);
}

async function fileSha256(path: string): Promise<string> {
  const bytes = await readFile(path);
  const h = createHash('sha256');
  h.update(bytes);
  return h.digest('hex');
}

async function checkRasterLock(violations: Violation[]): Promise<void> {
  try {
    const manifestRaw = await readFile('assets/template/raster-manifest.json', 'utf-8');
    const manifest = JSON.parse(manifestRaw) as { pages: Array<{ page: number; path: string; sha256: string }> };
    for (const entry of manifest.pages) {
      try {
        const actual = await fileSha256(entry.path);
        if (actual !== entry.sha256) {
          violations.push({
            severity: 'warning',
            check: 'raster-lock',
            message: `${entry.path} SHA256 changed since last rasterization (recorded=${entry.sha256.slice(0, 12)} actual=${actual.slice(0, 12)})`,
            suggestion: 'If this was intentional (e.g., after a pdf-to-img upgrade), run `npm run rasterize` to update the manifest. Then update golden crops with `npm run crop-diff -- --baseline`.',
          });
        }
      } catch (err) {
        violations.push({
          severity: 'warning',
          check: 'raster-lock',
          message: `${entry.path} not found: ${(err as Error).message}. Run \`npm run rasterize\`.`,
        });
      }
    }
  } catch {
    violations.push({
      severity: 'warning',
      check: 'raster-lock',
      message: 'assets/template/raster-manifest.json not found — run `npm run rasterize` to create the raster lock.',
    });
  }
}

async function checkTemplateHash(violations: Violation[]): Promise<void> {
  const recorded = (anchorsJson as { source_sha256?: string }).source_sha256;
  if (!recorded) {
    violations.push({
      severity: 'warning',
      check: 'template-hash',
      message: 'template-anchors.json has no source_sha256 — cannot verify the anchors JSON matches the current template PDF.',
      suggestion: 'Run `npm run extract-anchors` to regenerate with a SHA recorded.',
    });
    return;
  }
  try {
    const actual = await fileSha256('assets/acord-25-template.pdf');
    if (actual !== recorded) {
      violations.push({
        severity: 'error',
        check: 'template-hash',
        message: `template-anchors.json was generated from a different ACORD 25 PDF (sha256 mismatch). recorded=${recorded.slice(0, 12)} actual=${actual.slice(0, 12)}`,
        suggestion: 'Run `npm run extract-anchors` to regenerate the anchors JSON from the current template.',
      });
    }
  } catch (err) {
    violations.push({
      severity: 'warning',
      check: 'template-hash',
      message: `Could not read assets/acord-25-template.pdf: ${(err as Error).message}`,
    });
  }
}

function checkAnchorClearance(violations: Violation[]): void {
  for (const [key, ref] of Object.entries(FIELD_ANCHORS)) {
    let anchor;
    try {
      anchor = findAnchor(ref.anchor, ref.nearY);
    } catch (err) {
      if (err instanceof MissingAnchorError) {
        violations.push({
          severity: 'error',
          check: 'anchor-resolution',
          field: key,
          message: err.message,
        });
        continue;
      }
      throw err;
    }
    const coord = (COORDS as Record<string, Coord>)[key];
    if (!coord) {
      violations.push({
        severity: 'error',
        check: 'coords-missing',
        field: key,
        message: `${key}: FIELD_ANCHORS registered but no COORDS entry`,
      });
      continue;
    }
    pushClearanceViolation(violations, key, ref, anchor, coord);
  }
}

function pushClearanceViolation(
  violations: Violation[],
  key: string,
  ref: AnchorRef,
  anchor: { text: string; x: number; y: number; width: number; height: number },
  coord: Coord,
): void {
  switch (ref.side) {
    case 'right': {
      const labelRight = anchor.x + anchor.width;
      const clearance = coord.x - labelRight;
      if (clearance < MIN_CLEARANCE_PT) {
        violations.push({
          severity: 'error',
          check: 'anchor-clearance',
          field: key,
          message: `${key} only ${clearance.toFixed(2)}pt right of "${anchor.text}" (need ≥${MIN_CLEARANCE_PT})`,
          suggestion: `Increase dx by ${(MIN_CLEARANCE_PT - clearance + 1).toFixed(1)} in lib/coords.ts`,
        });
      }
      break;
    }
    case 'left': {
      const clearance = anchor.x - coord.x;
      if (clearance < MIN_CLEARANCE_PT) {
        violations.push({
          severity: 'error',
          check: 'anchor-clearance',
          field: key,
          message: `${key} only ${clearance.toFixed(2)}pt left of "${anchor.text}" (need ≥${MIN_CLEARANCE_PT})`,
          suggestion: `Decrease dx (make it more negative) in lib/coords.ts`,
        });
      }
      break;
    }
    case 'below': {
      const clearance = anchor.y - coord.y;
      if (clearance < MIN_CLEARANCE_PT) {
        violations.push({
          severity: 'error',
          check: 'anchor-clearance',
          field: key,
          message: `${key} only ${clearance.toFixed(2)}pt below "${anchor.text}" (need ≥${MIN_CLEARANCE_PT})`,
        });
      }
      break;
    }
    case 'above': {
      const clearance = coord.y - anchor.y;
      if (clearance < MIN_CLEARANCE_PT) {
        violations.push({
          severity: 'error',
          check: 'anchor-clearance',
          field: key,
          message: `${key} only ${clearance.toFixed(2)}pt above "${anchor.text}" (need ≥${MIN_CLEARANCE_PT})`,
        });
      }
      break;
    }
    case 'row': {
      const insideAnchorX =
        coord.x >= anchor.x - MIN_CLEARANCE_PT && coord.x <= anchor.x + anchor.width + MIN_CLEARANCE_PT;
      const yDist = Math.abs(coord.y - anchor.y);
      if (insideAnchorX && yDist < LINE_HEIGHT / 2) {
        violations.push({
          severity: 'error',
          check: 'anchor-clearance',
          field: key,
          message: `${key} (${coord.x}, ${coord.y}) falls inside "${anchor.text}" bbox`,
        });
      }
      break;
    }
    case 'inside': {
      const region = anchor;
      const inside =
        coord.x >= region.x &&
        coord.x <= region.x + region.width &&
        coord.y >= region.y &&
        coord.y <= region.y + region.height;
      if (!inside) {
        violations.push({
          severity: 'error',
          check: 'region-bounds',
          field: key,
          message: `${key} (${coord.x}, ${coord.y}) is OUTSIDE region "${region.text}" [x=${region.x}..${(region.x + region.width).toFixed(2)}, y=${region.y}..${(region.y + region.height).toFixed(2)}]`,
        });
      }
      break;
    }
  }
}

function checkPageBounds(violations: Violation[]): void {
  for (const [key, coord] of Object.entries(COORDS as Record<string, Coord | { x: number; y: number; width: number; height: number }>)) {
    const isOnPage =
      coord.x >= 0 && coord.x <= PAGE_WIDTH && coord.y >= 0 && coord.y <= PAGE_HEIGHT;
    if (!isOnPage) {
      violations.push({
        severity: 'error',
        check: 'page-bounds',
        field: key,
        message: `${key} at (${coord.x}, ${coord.y}) is off-page (page is ${PAGE_WIDTH}×${PAGE_HEIGHT})`,
      });
    }
  }
}

function checkFieldCollisions(violations: Violation[]): void {
  const bboxes: Array<{ key: string; bbox: BBox }> = [];
  for (const key of Object.keys(FIELD_ANCHORS)) {
    const coord = (COORDS as Record<string, Coord>)[key];
    if (!coord) continue;
    const value = typicalValue(key, coord);
    bboxes.push({ key, bbox: predictedTextBBox(coord, value) });
  }
  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      const a = bboxes[i]!;
      const b = bboxes[j]!;
      if (bboxesOverlap(a.bbox, b.bbox)) {
        violations.push({
          severity: 'error',
          check: 'field-collision',
          message: `${a.key} ↔ ${b.key}: bboxes overlap with typical values`,
          suggestion: `Investigate dx/dy or maxWidth — one of these fields renders into the other's cell.`,
        });
      }
    }
  }
}

async function checkRenderedOverlap(violations: Violation[]): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await fillAcord25(SHEFFER_FIXTURE);
  } catch (err) {
    violations.push({
      severity: 'error',
      check: 'render',
      message: `fillAcord25 threw: ${(err as Error).message}`,
    });
    return;
  }
  const items = await extractTextWithPositions(bytes);
  for (const [key, ref] of Object.entries(FIELD_ANCHORS)) {
    if (isRegionAnchor(ref.anchor)) continue;
    const coord = (COORDS as Record<string, Coord>)[key];
    if (!coord) continue;
    const rendered = items.find(
      (i) => Math.abs(i.x - coord.x) <= MIN_CLEARANCE_PT && Math.abs(i.y - coord.y) <= MIN_CLEARANCE_PT,
    );
    if (!rendered) continue;
    const anchor = findAnchor(ref.anchor, ref.nearY);
    const labelBBox: BBox = { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height };
    const fieldBBox = textBBox(rendered, coord.size ?? DEFAULT_SIZE);
    if (bboxesOverlap(fieldBBox, labelBBox)) {
      violations.push({
        severity: 'error',
        check: 'rendered-overlap',
        field: key,
        message: `${key}: rendered "${rendered.text}" (w=${rendered.width.toFixed(1)}) overlaps "${anchor.text}" bbox`,
      });
    }
  }
}

export interface RunChecksOptions {
  /** Skip the render-and-extract pass (faster, but loses rendered-overlap detection). */
  skipRender?: boolean;
}

export async function runChecks(opts: RunChecksOptions = {}): Promise<DoctorReport> {
  const start = Date.now();
  const violations: Violation[] = [];

  await checkRasterLock(violations);
  await checkTemplateHash(violations);
  checkAnchorClearance(violations);
  checkPageBounds(violations);
  checkFieldCollisions(violations);
  if (!opts.skipRender) {
    await checkRenderedOverlap(violations);
  }

  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  return {
    passed: errors === 0,
    violations,
    summary: {
      totalChecks: 6,
      fieldsChecked: Object.keys(FIELD_ANCHORS).length,
      errors,
      warnings,
      durationMs: Date.now() - start,
    },
  };
}
