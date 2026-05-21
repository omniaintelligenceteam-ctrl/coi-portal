'use client';

/**
 * Live countdown to a cert's auto-release. Ticks every 30 seconds (no point
 * burning CPU on a per-second update for an hour-long window). Renders
 * "auto-issues in 12m" or "auto-issues in 47s" depending on proximity.
 *
 * When the deadline passes, it stops at "any moment" — the cron will pick
 * it up within 5 minutes. The page should auto-refresh shortly after via
 * the realtime subscription.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export function HoldbackCountdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, target - now);
  const label = formatRemaining(remaining);

  return (
    <span
      className="caps inline-flex items-center gap-1 rounded border border-warning/30 bg-warning-soft/60 px-2 py-1 text-[0.6rem] font-semibold tracking-caps text-warning"
      role="status"
      aria-live="polite"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {remaining > 0 ? `Auto-issues in ${label}` : 'Auto-issuing any moment'}
    </span>
  );
}

function formatRemaining(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    return `${m}m`;
  }
  return `${totalSec}s`;
}
