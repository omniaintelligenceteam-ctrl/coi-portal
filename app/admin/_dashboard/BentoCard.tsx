import Link from 'next/link';
import { cn } from '@/app/components/ui';
import type { ReactNode } from 'react';

/**
 * Bento card primitive — the canonical surface for the admin home dashboard.
 *
 * Hairline border, no shadow as primary. Hover lifts the border (the Statement
 * way of signalling interactivity without box-shadow noise). The `tall` variant
 * spans two grid rows; `wide` spans two columns; `full` spans all columns.
 *
 * Pass `href` to make the entire card a soft navigation target. Without it
 * the card is a static container.
 */
export function BentoCard({
  label,
  delta,
  tall = false,
  wide = false,
  full = false,
  className,
  children,
  href,
}: {
  label?: ReactNode;
  delta?: { value: string; tone?: 'success' | 'neutral' | 'danger' };
  tall?: boolean;
  wide?: boolean;
  full?: boolean;
  className?: string;
  children: ReactNode;
  href?: string;
}) {
  const classes = cn(
    'rise group rounded-[var(--r-lg)] border border-hairline bg-card p-5 transition-colors duration-200',
    href && 'focus-ring block cursor-pointer hover:border-hairline-strong',
    tall && 'row-span-2',
    wide && 'col-span-2',
    full && 'col-span-full',
    className,
  );

  const body = (
    <>
      {label && (
        <div className="flex items-center justify-between text-ink-faint">
          <span className="caps text-[0.62rem] font-semibold">{label}</span>
          {delta && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[0.7rem] font-semibold',
                delta.tone === 'success' && 'bg-success-soft text-success',
                delta.tone === 'danger' && 'bg-danger-soft text-danger',
                (!delta.tone || delta.tone === 'neutral') && 'bg-paper-deep text-ink-muted',
              )}
            >
              {delta.value}
            </span>
          )}
        </div>
      )}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
