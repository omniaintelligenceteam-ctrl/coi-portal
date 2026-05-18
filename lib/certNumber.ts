/**
 * Certificate number generator.
 *
 * Format: PP-YYYYMMDD-XXXX
 *   - YYYYMMDD: the date the cert was issued (UTC-stable; we format from local-Y/M/D
 *     of the passed-in Date so callers control the timezone)
 *   - XXXX: zero-padded 4-digit per-day sequence, starting at 0001
 *
 * The function is pure: caller persists state (e.g. in Supabase) between calls.
 * Sequence resets to 0001 when the date rolls over.
 */

export type CertNumberState = { date: string; nextSeq: number };

const MAX_DAILY_SEQ = 9999;

function formatDate(today: Date): string {
  const y = today.getFullYear().toString().padStart(4, '0');
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

function padSeq(seq: number): string {
  return seq.toString().padStart(4, '0');
}

/**
 * Pure function: given today's date + the current state, returns next cert number
 * + updated state. Resets sequence to 0001 if date has rolled over.
 *
 * @throws if the daily sequence would exceed 9999.
 */
export function nextCertNumber(
  today: Date,
  state: CertNumberState | null,
): { certNumber: string; state: CertNumberState } {
  const date = formatDate(today);

  // Roll over if no prior state or date mismatch.
  const seq = state && state.date === date ? state.nextSeq : 1;

  if (seq > MAX_DAILY_SEQ) {
    throw new Error('Daily cert limit exceeded');
  }

  const certNumber = `PP-${date}-${padSeq(seq)}`;
  return {
    certNumber,
    state: { date, nextSeq: seq + 1 },
  };
}

/**
 * Parse a cert number back into components for validation/audit display.
 * Returns null if the format is invalid.
 */
export function parseCertNumber(certNumber: string): { date: string; seq: number } | null {
  const match = /^PP-(\d{8})-(\d{4})$/.exec(certNumber);
  if (!match) return null;
  const date = match[1]!;
  const seq = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(seq)) return null;
  return { date, seq };
}
