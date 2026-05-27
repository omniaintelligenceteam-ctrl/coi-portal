import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Editorial-style section header used to break up long detail pages.
 *
 * Replaces ad-hoc `<Hairline label=... />` blocks that read as noise rather
 * than structure. Composition:
 *
 *   <Section eyebrow="01" title="Coverages selected" description="3 policies">
 *     ...content
 *   </Section>
 *
 * - `eyebrow`: numbered prefix (mono, brand color) — optional but recommended
 * - `title`: display-weight section heading
 * - `description`: one-liner shown beneath the title (max ~60ch)
 * - `actions`: right-aligned slot for buttons (e.g. "Add coverage")
 * - `tone`: surfaces the divider in a different color when the section is
 *   destructive (`danger`) or ceremonial (`seal`)
 * - `bare`: skip the bottom hairline, e.g. when the next block already draws one
 */
type Tone = 'default' | 'danger' | 'seal' | 'brand';

const toneAccent: Record<Tone, string> = {
  default: 'text-brand',
  danger: 'text-danger',
  seal: 'text-seal-deep',
  brand: 'text-brand',
};

const toneDivider: Record<Tone, string> = {
  default: 'border-hairline',
  danger: 'border-danger/30',
  seal: 'border-seal/30',
  brand: 'border-brand/25',
};

export function Section({
  eyebrow,
  title,
  description,
  actions,
  tone = 'default',
  bare = false,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
  bare?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div
        className={cn(
          'flex flex-wrap items-end justify-between gap-4 pb-4',
          !bare && 'border-b',
          !bare && toneDivider[tone]
        )}
      >
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className={cn(
                'caps font-mono text-[0.62rem] font-semibold tracking-[0.18em]',
                toneAccent[tone]
              )}
            >
              {eyebrow}
            </p>
          )}
          <h2 className="font-display mt-1.5 text-[1.375rem] font-medium leading-[1.15] tracking-display text-ink sm:text-[1.5rem]">
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 max-w-[60ch] text-[0.875rem] leading-[1.55] text-ink-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-6 sm:mt-7">{children}</div>}
    </section>
  );
}
