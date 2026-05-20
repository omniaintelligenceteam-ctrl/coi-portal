/**
 * E&O-critical expiry + lifecycle gate.
 *
 * Filters a list of policies to only those still in force today. Called on the
 * server BOTH before rendering the form AND in the generate-coi endpoint before
 * producing the PDF. Never trust client-side filtering — an expired or
 * cancelled policy must never reach the cert.
 *
 * Eligibility: active = true AND status = 'active' AND exp_date >= today
 * (inclusive — same-day expiry is still valid for the cert).
 *
 * `active` and `status` are independent:
 *   - active (boolean): admin soft-delete (hide from everywhere)
 *   - status ('active' | 'cancelled' | 'expired'): public coverage lifecycle
 * A policy must pass BOTH gates to appear on a cert.
 */

export type DbPolicy = {
  id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  eff_date: string; // 'YYYY-MM-DD' from Postgres date type
  exp_date: string;
  active: boolean;
  status?: 'active' | 'cancelled' | 'expired';
};

/**
 * Format a Date as YYYY-MM-DD (local) for lexical comparison against Postgres date strings.
 * Postgres `date` columns serialize to ISO 'YYYY-MM-DD' and that format sorts correctly
 * as a string, so a string comparison is safe and equivalent to a date comparison
 * (and avoids timezone surprises from Date-object math).
 */
function toIsoDate(today: Date): string {
  const y = today.getFullYear().toString().padStart(4, '0');
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns only policies that are eligible to appear on a cert generated TODAY.
 *
 * A policy without a `status` field is treated as `active` (backward compat
 * for any code path that hasn't selected the new column yet).
 */
export function selectableCoverages<T extends DbPolicy>(policies: T[], today: Date): T[] {
  const todayIso = toIsoDate(today);
  return policies.filter(
    (p) => p.active && (p.status ?? 'active') === 'active' && p.exp_date >= todayIso,
  );
}
