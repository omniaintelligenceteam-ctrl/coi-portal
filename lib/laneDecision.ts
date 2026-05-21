/**
 * Trust-ladder lane decision.
 *
 * Routes a cert request to one of three lanes based on the reviewer agent's
 * confidence score, the client's auto_approve_enabled flag, and the client's
 * per-client thresholds.
 *
 *   manual    Brook reviews. Default for clients still building trust.
 *   holdback  Auto-approves after a 1h delay. Brook can intercept.
 *   instant   Auto-approves now. The system is confident enough to act alone.
 *
 * Default thresholds (per the product brief): 70 / 90 with per-client graduation.
 * Brook can tune per-client from the client settings page.
 */

export type Lane = 'manual' | 'holdback' | 'instant';

export const HOLDBACK_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_THRESHOLD_LOW = 70;
export const DEFAULT_THRESHOLD_HIGH = 90;

export type LaneInputs = {
  autoApproveEnabled: boolean;
  thresholdLow: number;
  thresholdHigh: number;
  confidenceScore: number | null;
};

export function decideLane({
  autoApproveEnabled,
  thresholdLow,
  thresholdHigh,
  confidenceScore,
}: LaneInputs): Lane {
  // Auto-approve disabled: always queue for Brook.
  if (!autoApproveEnabled) return 'manual';
  // Reviewer didn't produce a score (failed / errored): safety-default manual.
  if (confidenceScore == null) return 'manual';
  // Above the high threshold: instant auto-issue.
  if (confidenceScore >= thresholdHigh) return 'instant';
  // Above the low threshold (but below high): holdback with intercept window.
  if (confidenceScore >= thresholdLow) return 'holdback';
  // Below the low threshold: queue for Brook.
  return 'manual';
}

/** ISO timestamp 1 hour from `now`. The cron release window. */
export function holdbackUntil(now: Date = new Date()): string {
  return new Date(now.getTime() + HOLDBACK_DURATION_MS).toISOString();
}
