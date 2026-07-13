/**
 * ROI stats for the admin dashboard — computed from sent cert_requests.
 *
 * Pure functions over row snapshots so the math is unit-testable without a
 * DB. "Hands-free" means the trust ladder sent the cert without Brook
 * touching it: instant/holdback lane, never intercepted.
 */

export type RoiSourceRow = {
  requested_at: string;
  sent_at: string | null;
  auto_approve_lane?: 'manual' | 'holdback' | 'instant' | null;
  intercepted_at?: string | null;
};

export type RoiStats = {
  sentCount: number;
  /** 0-100 (rounded); null when nothing was sent in the window. */
  handsFreePct: number | null;
  /** Mean request→sent duration in minutes; null when nothing was sent. */
  avgMinutesToSent: number | null;
  /** sentCount × baselineMinutes, in hours (1 decimal). */
  hoursSaved: number;
};

/** Manual-issuance baseline: lookup dec pages, retype into ACORD, email. */
export const MANUAL_MINUTES_BASELINE = 20;

export function computeRoiStats(
  rows: RoiSourceRow[],
  opts: { baselineMinutes?: number } = {},
): RoiStats {
  const baseline = opts.baselineMinutes ?? MANUAL_MINUTES_BASELINE;
  const sent = rows.filter((r) => Boolean(r.sent_at));
  const sentCount = sent.length;

  if (sentCount === 0) {
    return { sentCount: 0, handsFreePct: null, avgMinutesToSent: null, hoursSaved: 0 };
  }

  const handsFree = sent.filter(
    (r) =>
      (r.auto_approve_lane === 'instant' || r.auto_approve_lane === 'holdback') &&
      !r.intercepted_at,
  ).length;

  let totalMinutes = 0;
  let timed = 0;
  for (const r of sent) {
    const start = new Date(r.requested_at).getTime();
    const end = new Date(r.sent_at as string).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    totalMinutes += (end - start) / 60_000;
    timed++;
  }

  return {
    sentCount,
    handsFreePct: Math.round((handsFree / sentCount) * 100),
    avgMinutesToSent: timed > 0 ? totalMinutes / timed : null,
    hoursSaved: Math.round(((sentCount * baseline) / 60) * 10) / 10,
  };
}

/** "3m" under an hour, "2.4h" under a day, "1.2d" beyond. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}
