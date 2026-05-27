import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Labeled value pair used in detail views.
 *
 * Replaces inline `<span>·<span>·` chains in coverage rows, party cards, and
 * audit rows. Two layouts:
 *
 *   <KeyValue label="Insurer" value="Liberty Mutual" />          // stacked
 *   <KeyValue orientation="horizontal" label="Status" value=... /> // inline
 *
 * Pass `mono` to render the value in tabular Geist Mono — for IDs, dates,
 * policy numbers, anything where digit alignment matters.
 */
export function KeyValue({
  label,
  value,
  mono = false,
  orientation = 'stacked',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  orientation?: 'stacked' | 'horizontal';
  className?: string;
}) {
  if (orientation === 'horizontal') {
    return (
      <div
        className={cn(
          'flex flex-wrap items-baseline gap-x-3 gap-y-1',
          className
        )}
      >
        <dt className="caps shrink-0 text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
          {label}
        </dt>
        <dd
          className={cn(
            'min-w-0 flex-1 text-[0.875rem] leading-[1.5] text-ink',
            mono && 'num-tabular font-mono text-[0.8125rem]'
          )}
        >
          {value}
        </dd>
      </div>
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      <dt className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1.5 text-[0.875rem] leading-[1.5] text-ink',
          mono && 'num-tabular font-mono text-[0.8125rem]'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
