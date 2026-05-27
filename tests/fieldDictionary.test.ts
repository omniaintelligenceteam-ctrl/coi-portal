import { describe, it, expect } from 'vitest';
import { SHEFFER_FIXTURE } from './fixtures/sheffer.js';
import {
  FIELD_DICTIONARY,
  getResolver,
  isDictionaryKey,
  dictionaryByGroup,
} from '../lib/forms/fieldDictionary.js';

describe('fieldDictionary', () => {
  it('exposes 75+ entries covering every ACORD 25 COORDS key', () => {
    // Sanity: anything significantly less means we lost entries; anything
    // wildly more means we leaked test fields into the dictionary.
    expect(FIELD_DICTIONARY.length).toBeGreaterThanOrEqual(75);
    expect(FIELD_DICTIONARY.length).toBeLessThan(120);
  });

  it('has unique keys', () => {
    const keys = FIELD_DICTIONARY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves header + insured + holder fields from Sheffer fixture', () => {
    expect(getResolver('date')!(SHEFFER_FIXTURE)).toBe(SHEFFER_FIXTURE.certDate);
    expect(getResolver('insured_name')!(SHEFFER_FIXTURE)).toBe(SHEFFER_FIXTURE.insured.name);
    expect(getResolver('insured_address_1')!(SHEFFER_FIXTURE)).toBe(SHEFFER_FIXTURE.insured.address1);
    expect(getResolver('holder_name')!(SHEFFER_FIXTURE)).toBe(SHEFFER_FIXTURE.holder.name);
    expect(getResolver('cert_number')!(SHEFFER_FIXTURE)).toBe(SHEFFER_FIXTURE.certNumber);
  });

  it('resolves GL coverage fields including comma-formatted money', () => {
    const gl = SHEFFER_FIXTURE.coverages.find((c) => c.type === 'GL');
    if (!gl || gl.type !== 'GL') throw new Error('fixture missing GL');

    expect(getResolver('gl_chk_type')!(SHEFFER_FIXTURE)).toBe('X');
    expect(getResolver('gl_policy_number')!(SHEFFER_FIXTURE)).toBe(gl.policyNumber);
    expect(getResolver('gl_eff_date')!(SHEFFER_FIXTURE)).toBe(gl.effDate);
    expect(getResolver('gl_limit_each_occ')!(SHEFFER_FIXTURE)).toBe(
      gl.limits.eachOccurrence.toLocaleString('en-US'),
    );
  });

  it('returns empty string for absent coverages (e.g., no UMBRELLA)', () => {
    const noUmb = {
      ...SHEFFER_FIXTURE,
      coverages: SHEFFER_FIXTURE.coverages.filter((c) => c.type !== 'UMBRELLA'),
    };
    expect(getResolver('umb_chk_umbrella')!(noUmb)).toBe('');
    expect(getResolver('umb_policy_number')!(noUmb)).toBe('');
    expect(getResolver('umb_limit_each_occ')!(noUmb)).toBe('');
  });

  it('checkbox resolvers return X or empty', () => {
    for (const e of FIELD_DICTIONARY.filter((e) => e.key.includes('_chk_'))) {
      const v = e.resolver(SHEFFER_FIXTURE);
      expect(v === '' || v === 'X').toBe(true);
    }
  });

  it('isDictionaryKey discriminates known vs unknown keys', () => {
    expect(isDictionaryKey('insured_name')).toBe(true);
    expect(isDictionaryKey('custom_5')).toBe(false);
    expect(isDictionaryKey('totally_made_up')).toBe(false);
  });

  it('dictionaryByGroup buckets entries by group', () => {
    const grouped = dictionaryByGroup();
    expect(grouped.insured.length).toBeGreaterThan(0);
    expect(grouped.gl.length).toBeGreaterThan(0);
    expect(grouped.holder.length).toBeGreaterThan(0);
    // Each entry appears exactly once across groups
    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(FIELD_DICTIONARY.length);
  });
});
