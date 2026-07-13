/**
 * Constant-time string comparison for shared-secret checks (webhook secrets,
 * bearer API keys). A plain `===` short-circuits at the first differing
 * character, which leaks match-prefix length as a timing side channel.
 *
 * Length inequality returns early — revealing the secret's length is accepted
 * (both call sites use fixed-length generated secrets).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
