'use client';

import { CountUp } from '@/app/components/motion';

/**
 * Stat number — large display digit with optional CountUp animation.
 * Tabular numerals from Geist, weight 350, tracked tight for display use.
 *
 * Client component because CountUp needs RAF. SSR-safe: renders the final
 * value first, then animates on hydrate.
 */
export function StatNumber({
  value,
  sub,
  animate = true,
}: {
  value: number;
  sub?: string;
  animate?: boolean;
}) {
  return (
    <div>
      <p className="num-tabular mt-3 text-[2.75rem] font-[350] leading-[1.05] tracking-display text-ink">
        {animate ? <CountUp value={value} /> : value}
      </p>
      {sub && <p className="mt-1 text-[0.825rem] text-ink-faint">{sub}</p>}
    </div>
  );
}
