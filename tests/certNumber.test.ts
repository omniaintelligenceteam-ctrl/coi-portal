/**
 * Contract test for the cert number generator.
 *
 * Locks the PP-YYYYMMDD-XXXX format, the per-day sequence reset, and the 9999/day
 * invariant. Pure function — no timer mocking needed; we pass dates explicitly.
 */

import { describe, it, expect } from 'vitest';
import { nextCertNumber, parseCertNumber, type CertNumberState } from '../lib/certNumber.js';

describe('nextCertNumber', () => {
  it('first call of the day with null state returns 0001 and updated state', () => {
    const today = new Date(2026, 4, 18); // May 18 2026 (month is 0-indexed)
    const { certNumber, state } = nextCertNumber(today, null);
    expect(certNumber).toBe('PP-20260518-0001');
    expect(state).toEqual({ date: '20260518', nextSeq: 2 });
  });

  it('second call same day increments the sequence', () => {
    const today = new Date(2026, 4, 18);
    const prior: CertNumberState = { date: '20260518', nextSeq: 2 };
    const { certNumber, state } = nextCertNumber(today, prior);
    expect(certNumber).toBe('PP-20260518-0002');
    expect(state).toEqual({ date: '20260518', nextSeq: 3 });
  });

  it('rolls over to 0001 when the date changes', () => {
    const today = new Date(2026, 4, 19);
    const yesterdayState: CertNumberState = { date: '20260518', nextSeq: 17 };
    const { certNumber, state } = nextCertNumber(today, yesterdayState);
    expect(certNumber).toBe('PP-20260519-0001');
    expect(state).toEqual({ date: '20260519', nextSeq: 2 });
  });

  it('produces 9999 as the last valid sequence of the day', () => {
    const today = new Date(2026, 4, 18);
    const prior: CertNumberState = { date: '20260518', nextSeq: 9999 };
    const { certNumber, state } = nextCertNumber(today, prior);
    expect(certNumber).toBe('PP-20260518-9999');
    expect(state).toEqual({ date: '20260518', nextSeq: 10000 });
  });

  it('throws once the daily limit (10000th cert) is reached', () => {
    const today = new Date(2026, 4, 18);
    const prior: CertNumberState = { date: '20260518', nextSeq: 10000 };
    expect(() => nextCertNumber(today, prior)).toThrow('Daily cert limit exceeded');
  });

  it('pads single-digit months and days correctly', () => {
    const today = new Date(2026, 0, 3); // Jan 3
    const { certNumber } = nextCertNumber(today, null);
    expect(certNumber).toBe('PP-20260103-0001');
  });
});

describe('parseCertNumber', () => {
  it('parses a valid cert number into its components', () => {
    expect(parseCertNumber('PP-20260518-0042')).toEqual({ date: '20260518', seq: 42 });
  });

  it('parses the 0001 sequence as seq 1', () => {
    expect(parseCertNumber('PP-20260518-0001')).toEqual({ date: '20260518', seq: 1 });
  });

  it('returns null for a malformed cert number', () => {
    expect(parseCertNumber('bogus')).toBeNull();
  });

  it('returns null for the right prefix but wrong digit counts', () => {
    expect(parseCertNumber('PP-2026051-0001')).toBeNull();
    expect(parseCertNumber('PP-20260518-001')).toBeNull();
    expect(parseCertNumber('PP-20260518-00012')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseCertNumber('')).toBeNull();
  });
});
