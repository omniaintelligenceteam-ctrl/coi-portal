import { describe, expect, it } from 'vitest';
import {
  decideLane,
  holdbackUntil,
  HOLDBACK_DURATION_MS,
  DEFAULT_THRESHOLD_HIGH,
  DEFAULT_THRESHOLD_LOW,
} from '../lib/laneDecision';

const base = {
  autoApproveEnabled: true,
  thresholdLow: DEFAULT_THRESHOLD_LOW,
  thresholdHigh: DEFAULT_THRESHOLD_HIGH,
};

describe('decideLane', () => {
  it('always manual when auto-approve is off, regardless of confidence', () => {
    expect(decideLane({ ...base, autoApproveEnabled: false, confidenceScore: 100 })).toBe('manual');
  });

  it('safety-defaults to manual when the reviewer produced no score', () => {
    expect(decideLane({ ...base, confidenceScore: null })).toBe('manual');
  });

  it('routes by threshold: below low → manual, [low,high) → holdback, ≥high → instant', () => {
    expect(decideLane({ ...base, confidenceScore: 69 })).toBe('manual');
    expect(decideLane({ ...base, confidenceScore: 70 })).toBe('holdback');
    expect(decideLane({ ...base, confidenceScore: 89 })).toBe('holdback');
    expect(decideLane({ ...base, confidenceScore: 90 })).toBe('instant');
    expect(decideLane({ ...base, confidenceScore: 100 })).toBe('instant');
  });

  it('honors per-client thresholds', () => {
    expect(
      decideLane({ autoApproveEnabled: true, thresholdLow: 50, thresholdHigh: 60, confidenceScore: 55 }),
    ).toBe('holdback');
    expect(
      decideLane({ autoApproveEnabled: true, thresholdLow: 50, thresholdHigh: 60, confidenceScore: 60 }),
    ).toBe('instant');
  });
});

describe('holdbackUntil', () => {
  it('is exactly one hour out', () => {
    const now = new Date('2026-07-13T12:00:00.000Z');
    expect(new Date(holdbackUntil(now)).getTime() - now.getTime()).toBe(HOLDBACK_DURATION_MS);
  });
});
