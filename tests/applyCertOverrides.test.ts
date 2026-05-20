/**
 * Contract test for applyCertOverrides — the function that merges Brook's
 * pre-approval edits over the DB-derived CoiInput before rendering. Treat
 * these as load-bearing; a regression here can mis-render an E&O-sensitive
 * field on a real cert.
 */

import { describe, it, expect } from 'vitest';
import { applyCertOverrides } from '../lib/coiInputBuilder.js';
import type { CertOverrides, CoiInput, GLCoverage, Insurer } from '../lib/types.js';

function makeInput(): CoiInput {
  const insurers: Insurer[] = [
    { letter: 'A', name: 'ACME Insurance', naic: '12345' },
    { letter: 'B', name: 'Beta Mutual', naic: '67890' },
  ];
  const gl: GLCoverage = {
    type: 'GL',
    insurerLetter: 'A',
    policyId: 'pol-gl-1',
    policyNumber: 'GL-100',
    effDate: '01/01/2026',
    expDate: '01/01/2027',
    generalAggregateAppliesPer: 'POLICY',
    addlInsuredBlanket: false,
    subrogationWaived: false,
    limits: {
      eachOccurrence: 1_000_000,
      damageToRented: 50_000,
      medExp: 5_000,
      personalAdvInjury: 1_000_000,
      generalAggregate: 2_000_000,
      productsCompOp: 2_000_000,
    },
  };
  return {
    agency: {
      name: 'The Policy Place',
      address1: '908 Poplar St',
      address2: 'Benton, KY 42025',
      contactName: 'Brook',
      phone: '270-410-2015',
      fax: '',
      email: 'brook@yourpolicyplace.com',
    },
    insured: {
      name: 'Sheffer Construction',
      address1: '123 Main St',
      address2: 'Anywhere, USA',
    },
    insurers,
    coverages: [gl],
    holder: { name: 'ACME Corp', address1: '456 Holder Ave', address2: '' },
    certNumber: 'PP-20260520-0001-ABC',
    certDate: '05/20/2026',
    signaturePngPath: '/signatures/brook.png',
    templatePngPath: '/templates/acord-25.png',
  };
}

describe('applyCertOverrides', () => {
  it('returns the input unchanged when overrides is empty', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {});
    expect(out).toEqual(input);
  });

  it('merges agency overrides over the canonical agency block', () => {
    const input = makeInput();
    const overrides: CertOverrides = {
      agency: { phone: '555-1234', fax: '555-5678' },
    };
    const out = applyCertOverrides(input, overrides);
    expect(out.agency.phone).toBe('555-1234');
    expect(out.agency.fax).toBe('555-5678');
    // other fields untouched
    expect(out.agency.name).toBe(input.agency.name);
    expect(out.agency.email).toBe(input.agency.email);
  });

  it('merges insured overrides', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {
      insured: { name: 'Sheffer Construction LLC' },
    });
    expect(out.insured.name).toBe('Sheffer Construction LLC');
    expect(out.insured.address1).toBe(input.insured.address1);
  });

  it('sets the description and clears it when override is empty string', () => {
    const input = makeInput();
    const withDesc = applyCertOverrides(input, { description: 'Hello world' });
    expect(withDesc.description).toBe('Hello world');
    const cleared = applyCertOverrides(withDesc, { description: '' });
    expect(cleared.description).toBeUndefined();
  });

  it('rewrites an insurer name keyed by current NAIC', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {
      insurers: { '12345': { name: 'ACME Insurance Co.' } },
    });
    const a = out.insurers.find((i) => i.letter === 'A');
    expect(a?.name).toBe('ACME Insurance Co.');
    expect(a?.naic).toBe('12345');
    // insurer B untouched
    const b = out.insurers.find((i) => i.letter === 'B');
    expect(b?.name).toBe('Beta Mutual');
  });

  it('can change an insurer NAIC by current-NAIC key', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {
      insurers: { '12345': { naic: '99999' } },
    });
    const a = out.insurers.find((i) => i.letter === 'A');
    expect(a?.naic).toBe('99999');
  });

  it('merges per-coverage policy number and dates by policyId', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {
      coverages: {
        'pol-gl-1': {
          policyNumber: 'GL-100-REV2',
          effDate: '02/01/2026',
          expDate: '02/01/2027',
        },
      },
    });
    const gl = out.coverages.find((c) => c.type === 'GL');
    expect(gl?.policyNumber).toBe('GL-100-REV2');
    expect(gl?.effDate).toBe('02/01/2026');
    expect(gl?.expDate).toBe('02/01/2027');
  });

  it('merges per-coverage limits by key, preserving untouched keys', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {
      coverages: {
        'pol-gl-1': {
          limits: { eachOccurrence: 2_000_000 },
        },
      },
    });
    const gl = out.coverages.find((c) => c.type === 'GL') as GLCoverage | undefined;
    expect(gl?.limits.eachOccurrence).toBe(2_000_000);
    // other limit fields preserved
    expect(gl?.limits.damageToRented).toBe(50_000);
    expect(gl?.limits.generalAggregate).toBe(2_000_000);
  });

  it('toggles additional-insured and waiver-of-subrogation', () => {
    const input = makeInput();
    const out = applyCertOverrides(input, {
      coverages: {
        'pol-gl-1': { addlInsuredBlanket: true, subrogationWaived: true },
      },
    });
    const gl = out.coverages.find((c) => c.type === 'GL');
    expect(gl?.addlInsuredBlanket).toBe(true);
    expect(gl?.subrogationWaived).toBe(true);
  });

  it('does not mutate certDate, certNumber, signaturePngPath, templatePngPath', () => {
    const input = makeInput();
    // CertOverrides is structurally barred from these — but assert the
    // returned object still carries them verbatim as a regression guard.
    const out = applyCertOverrides(input, {
      agency: { name: 'Edited' },
      insured: { name: 'Edited' },
      description: 'Edited',
    });
    expect(out.certDate).toBe(input.certDate);
    expect(out.certNumber).toBe(input.certNumber);
    expect(out.signaturePngPath).toBe(input.signaturePngPath);
    expect(out.templatePngPath).toBe(input.templatePngPath);
  });

  it('leaves coverages without a policyId untouched', () => {
    const input = makeInput();
    // Construct a coverage with no policyId — simulating a legacy/test input
    const noIdInput: CoiInput = {
      ...input,
      coverages: input.coverages.map((c) => {
        const { policyId: _ignored, ...rest } = c;
        return rest as typeof c;
      }),
    };
    const out = applyCertOverrides(noIdInput, {
      coverages: { 'pol-gl-1': { policyNumber: 'SHOULD-NOT-APPLY' } },
    });
    expect((out.coverages[0] as GLCoverage).policyNumber).toBe('GL-100');
  });
});
