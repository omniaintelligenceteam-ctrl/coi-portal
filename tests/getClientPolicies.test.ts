/**
 * Contract test for the E&O-critical expiry gate.
 *
 * If any of these tests regress, an expired or inactive policy could land on a
 * generated cert — a real-world liability. Treat these as load-bearing.
 */

import { describe, it, expect } from 'vitest';
import { selectableCoverages, type DbPolicy } from '../lib/getClientPolicies.js';

const TODAY = new Date(2026, 4, 18); // May 18 2026

function makePolicy(overrides: Partial<DbPolicy> = {}): DbPolicy {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    type: 'GL',
    eff_date: '2026-01-01',
    exp_date: '2027-01-01',
    active: true,
    ...overrides,
  };
}

describe('selectableCoverages', () => {
  it('excludes policies whose exp_date is before today', () => {
    const expired = makePolicy({ exp_date: '2026-05-17' });
    expect(selectableCoverages([expired], TODAY)).toEqual([]);
  });

  it('includes policies whose exp_date is exactly today (same-day still valid)', () => {
    const sameDay = makePolicy({ exp_date: '2026-05-18' });
    expect(selectableCoverages([sameDay], TODAY)).toEqual([sameDay]);
  });

  it('includes policies whose exp_date is after today', () => {
    const future = makePolicy({ exp_date: '2026-05-19' });
    expect(selectableCoverages([future], TODAY)).toEqual([future]);
  });

  it('excludes inactive policies regardless of date', () => {
    const inactiveButValid = makePolicy({ active: false, exp_date: '2027-01-01' });
    expect(selectableCoverages([inactiveButValid], TODAY)).toEqual([]);
  });

  it('excludes policies with status=cancelled even when active and unexpired', () => {
    const cancelled = makePolicy({ status: 'cancelled', exp_date: '2027-01-01' });
    expect(selectableCoverages([cancelled], TODAY)).toEqual([]);
  });

  it('excludes policies with status=expired even when active and unexpired by date', () => {
    const expired = makePolicy({ status: 'expired', exp_date: '2027-01-01' });
    expect(selectableCoverages([expired], TODAY)).toEqual([]);
  });

  it('includes policies with status=active explicitly set', () => {
    const active = makePolicy({ status: 'active', exp_date: '2027-01-01' });
    expect(selectableCoverages([active], TODAY)).toEqual([active]);
  });

  it('treats missing status as active (backward compat with older callers)', () => {
    const noStatus = makePolicy({ exp_date: '2027-01-01' });
    expect(noStatus.status).toBeUndefined();
    expect(selectableCoverages([noStatus], TODAY)).toEqual([noStatus]);
  });

  it('returns an empty array for empty input', () => {
    expect(selectableCoverages([], TODAY)).toEqual([]);
  });

  it('filters a mixed batch correctly: 3 expired, 2 valid, 1 inactive-but-valid → 2 returned', () => {
    const policies: DbPolicy[] = [
      makePolicy({ id: 'expired-1', exp_date: '2026-05-01' }),
      makePolicy({ id: 'expired-2', exp_date: '2025-12-31' }),
      makePolicy({ id: 'expired-3', exp_date: '2026-05-17' }),
      makePolicy({ id: 'valid-1', exp_date: '2026-05-18' }),
      makePolicy({ id: 'valid-2', exp_date: '2027-06-30' }),
      makePolicy({ id: 'inactive-but-valid', active: false, exp_date: '2027-01-01' }),
    ];
    const result = selectableCoverages(policies, TODAY);
    expect(result.map((p) => p.id)).toEqual(['valid-1', 'valid-2']);
  });

  it('preserves the input subtype (generic T flows through)', () => {
    type Extended = DbPolicy & { custom: string };
    const policies: Extended[] = [
      { ...makePolicy({ id: 'a' }), custom: 'hello' },
    ];
    const result = selectableCoverages(policies, TODAY);
    // Type-level: result is Extended[], so `.custom` is accessible without a cast.
    expect(result[0]?.custom).toBe('hello');
  });
});
