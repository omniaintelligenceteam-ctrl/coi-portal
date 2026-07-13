import { describe, expect, it } from 'vitest';
import {
  checkRequirements,
  parseHolderRequirements,
  type HolderRequirements,
  type PolicyForRequirements,
} from '../lib/requirementsCheck';

function gl(overrides: Partial<PolicyForRequirements> = {}): PolicyForRequirements {
  return {
    type: 'GL',
    limits_jsonb: { eachOccurrence: 1_000_000, generalAggregate: 2_000_000 },
    addl_insured_blanket: false,
    subrogation_waived: false,
    primary_noncontributory: false,
    ...overrides,
  };
}

function wc(overrides: Partial<PolicyForRequirements> = {}): PolicyForRequirements {
  return {
    type: 'WC',
    limits_jsonb: { eachAccident: 1_000_000 },
    addl_insured_blanket: false,
    subrogation_waived: true,
    ...overrides,
  };
}

describe('parseHolderRequirements', () => {
  it('accepts a valid shape', () => {
    const parsed = parseHolderRequirements({
      requiredCoverageTypes: ['GL', 'WC'],
      requiredLimits: { GL: { eachOccurrence: 1_000_000 } },
      requiresAdditionalInsured: true,
    });
    expect(parsed?.requiredCoverageTypes).toEqual(['GL', 'WC']);
  });

  it('returns null for null/undefined/garbage', () => {
    expect(parseHolderRequirements(null)).toBeNull();
    expect(parseHolderRequirements(undefined)).toBeNull();
    expect(parseHolderRequirements({ requiredCoverageTypes: ['BOAT'] })).toBeNull();
    expect(parseHolderRequirements('not an object')).toBeNull();
  });
});

describe('checkRequirements', () => {
  it('passes clean when everything required is carried', () => {
    const req: HolderRequirements = {
      requiredCoverageTypes: ['GL', 'WC'],
      requiredLimits: { GL: { eachOccurrence: 1_000_000 } },
      requiresWaiverOfSubrogation: true,
    };
    expect(checkRequirements(req, [gl(), wc()])).toEqual([]);
  });

  it('flags a missing required coverage type', () => {
    const findings = checkRequirements({ requiredCoverageTypes: ['UMBRELLA'] }, [gl()]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.field).toBe('requirements.coverage.UMBRELLA');
  });

  it('flags a limit below the required minimum with both amounts', () => {
    const findings = checkRequirements(
      { requiredLimits: { GL: { eachOccurrence: 2_000_000 } } },
      [gl()],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('$2,000,000');
    expect(findings[0]!.message).toContain('$1,000,000');
  });

  it('uses the best value across multiple policies of the same type', () => {
    const findings = checkRequirements(
      { requiredLimits: { GL: { eachOccurrence: 2_000_000 } } },
      [gl(), gl({ limits_jsonb: { eachOccurrence: 2_000_000 } })],
    );
    expect(findings).toEqual([]);
  });

  it('flags required limits for a coverage type not on the cert (once, not twice)', () => {
    const findings = checkRequirements(
      {
        requiredCoverageTypes: ['WC'],
        requiredLimits: { WC: { eachAccident: 500_000 } },
      },
      [gl()],
    );
    // The missing-coverage error covers it; no duplicate limit error.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.field).toBe('requirements.coverage.WC');
  });

  it('flags missing endorsements: AI, WoS, P&NC', () => {
    const findings = checkRequirements(
      {
        requiresAdditionalInsured: true,
        requiresWaiverOfSubrogation: true,
        requiresPrimaryNoncontributory: true,
      },
      [gl()],
    );
    expect(findings.map((f) => f.field).sort()).toEqual([
      'requirements.additionalInsured',
      'requirements.primaryNoncontributory',
      'requirements.waiverOfSubrogation',
    ]);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('endorsement carried on ANY selected policy satisfies the requirement', () => {
    const findings = checkRequirements(
      { requiresWaiverOfSubrogation: true, requiresPrimaryNoncontributory: true },
      [gl({ primary_noncontributory: true }), wc()],
    );
    expect(findings).toEqual([]);
  });

  it('treats a policy without the P&NC column as not endorsed', () => {
    const policy = gl();
    delete (policy as Partial<PolicyForRequirements>).primary_noncontributory;
    const findings = checkRequirements({ requiresPrimaryNoncontributory: true }, [policy]);
    expect(findings).toHaveLength(1);
  });

  it('no requirements → no findings', () => {
    expect(checkRequirements({}, [gl()])).toEqual([]);
  });
});
