import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rasterizePdfPages } from '../lib/forms/rasterize.js';

describe('rasterizePdfPages', () => {
  it('rasterizes the ACORD 25 template to a single PNG at 300 DPI', async () => {
    const buf = readFileSync(resolve(process.cwd(), 'assets/acord-25-template.pdf'));
    const result = await rasterizePdfPages(buf, { dpi: 300 });

    expect(result.pngs.length).toBe(1);
    // ACORD 25 is Letter (8.5x11 in) → at 300 DPI ≈ 2550×3300 px.
    // Allow a little slack for renderer rounding.
    expect(result.width).toBeGreaterThan(2400);
    expect(result.width).toBeLessThan(2700);
    expect(result.height).toBeGreaterThan(3200);
    expect(result.height).toBeLessThan(3400);
    // PNG header check on page 1 — first 8 bytes must be the PNG magic.
    const png = result.pngs[0]!;
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  }, 30_000);

  it('throws if the buffer is not a parseable PDF', async () => {
    const garbage = Buffer.from('not a pdf');
    await expect(rasterizePdfPages(garbage)).rejects.toThrow();
  });
});
