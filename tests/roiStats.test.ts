import { describe, expect, it } from 'vitest';
import { computeRoiStats, formatDuration, type RoiSourceRow } from '../lib/roiStats';

function row(overrides: Partial<RoiSourceRow> = {}): RoiSourceRow {
  return {
    requested_at: '2026-07-01T10:00:00Z',
    sent_at: '2026-07-01T10:30:00Z',
    auto_approve_lane: 'manual',
    intercepted_at: null,
    ...overrides,
  };
}

describe('computeRoiStats', () => {
  it('returns nulls on an empty window', () => {
    const s = computeRoiStats([]);
    expect(s.sentCount).toBe(0);
    expect(s.handsFreePct).toBeNull();
    expect(s.avgMinutesToSent).toBeNull();
    expect(s.hoursSaved).toBe(0);
  });

  it('ignores unsent rows entirely', () => {
    const s = computeRoiStats([row({ sent_at: null })]);
    expect(s.sentCount).toBe(0);
    expect(s.handsFreePct).toBeNull();
  });

  it('counts instant and holdback lanes as hands-free, manual as not', () => {
    const s = computeRoiStats([
      row({ auto_approve_lane: 'instant' }),
      row({ auto_approve_lane: 'holdback' }),
      row({ auto_approve_lane: 'manual' }),
      row({ auto_approve_lane: null }),
    ]);
    expect(s.sentCount).toBe(4);
    expect(s.handsFreePct).toBe(50);
  });

  it('an intercepted holdback cert is NOT hands-free', () => {
    const s = computeRoiStats([
      row({ auto_approve_lane: 'holdback', intercepted_at: '2026-07-01T10:10:00Z' }),
      row({ auto_approve_lane: 'instant' }),
    ]);
    expect(s.handsFreePct).toBe(50);
  });

  it('averages request→sent minutes and skips corrupt timestamps', () => {
    const s = computeRoiStats([
      row(), // 30 minutes
      row({ requested_at: '2026-07-01T10:00:00Z', sent_at: '2026-07-01T11:30:00Z' }), // 90
      row({ requested_at: 'garbage' }), // skipped from timing, still counted as sent
    ]);
    expect(s.sentCount).toBe(3);
    expect(s.avgMinutesToSent).toBe(60);
  });

  it('computes hours saved from the manual baseline', () => {
    const s = computeRoiStats([row(), row(), row()], { baselineMinutes: 20 });
    expect(s.hoursSaved).toBe(1); // 3 × 20min = 60min = 1.0h
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours, and days', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0.4)).toBe('1m'); // floor of 1 minute
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(150)).toBe('2.5h');
    expect(formatDuration(60 * 36)).toBe('1.5d');
  });
});
