import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractAnchors } from '../lib/forms/extractAnchors.js';

describe('extractAnchors', () => {
  it('extracts labels from the ACORD 25 template', async () => {
    const buf = readFileSync(resolve(process.cwd(), 'assets/acord-25-template.pdf'));
    const result = await extractAnchors(buf);

    // ACORD 25 is US Letter
    expect(result.page_width).toBeCloseTo(612, 0);
    expect(result.page_height).toBeCloseTo(792, 0);

    // sha256 should match the file
    expect(result.source_sha256).toMatch(/^[a-f0-9]{64}$/);

    // At least the canonical labels Brook's COORDS reference should appear
    const texts = new Set(result.labels.map((l) => l.text));
    expect(texts.has('INSURED')).toBe(true);
    expect(texts.has('POLICY NUMBER')).toBe(true);
    expect(texts.has('CERTIFICATE NUMBER:')).toBe(true);

    // Labels are sorted top-to-bottom (descending y in PDF coords)
    for (let i = 1; i < result.labels.length; i++) {
      const prev = result.labels[i - 1]!;
      const curr = result.labels[i]!;
      if (Math.abs(prev.y - curr.y) > 1) {
        expect(curr.y).toBeLessThan(prev.y);
      }
    }
  }, 30_000);
});
