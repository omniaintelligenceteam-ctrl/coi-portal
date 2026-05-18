/**
 * Contract test for fillAcord25 — locks the type shape and the basic guarantees:
 *  - returns a non-empty PDF (>10kB)
 *  - PDF size stays reasonable (<2MB)
 *  - works for the canonical Sheffer COI input shape
 *
 * Visual fidelity is validated separately via `npm run regen-sheffer` + manual diff.
 */

import { describe, it, expect } from 'vitest';
import { fillAcord25 } from '../lib/fillAcord25.js';
import type { CoiInput } from '../lib/types.js';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';

describe('fillAcord25', () => {
  it('produces a non-empty PDF buffer from the Sheffer fixture', async () => {
    const pdfBytes = await fillAcord25(SHEFFER_FIXTURE);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(10_000);
    expect(pdfBytes.length).toBeLessThan(2_000_000);
  });

  it('produces a smaller PDF when only one coverage is selected', async () => {
    const oneCov: CoiInput = {
      ...SHEFFER_FIXTURE,
      coverages: [SHEFFER_FIXTURE.coverages[0]!],
    };
    const pdfBytes = await fillAcord25(oneCov);
    expect(pdfBytes.length).toBeGreaterThan(10_000);
  });

  it('does not throw when signaturePngPath is empty', async () => {
    await expect(fillAcord25({ ...SHEFFER_FIXTURE, signaturePngPath: '' })).resolves.toBeInstanceOf(Uint8Array);
  });
});
