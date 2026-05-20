import type { ReactNode } from 'react';
import { cn } from './cn';

export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  actions,
  tone = 'default',
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'seal' | 'success' | 'brand';
  className?: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: 'border-hairline bg-card text-ink',
    seal: 'border-seal/30 bg-seal-soft/40 text-ink',
    success: 'border-success/30 bg-success-soft/40 text-ink',
    brand: 'border-brand/30 bg-brand-soft/50 text-ink',
  };

  const iconRing: Record<typeof tone, string> = {
    default: 'border-hairline-strong bg-paper text-ink-muted',
    seal: 'border-seal/40 bg-paper text-seal-deep',
    success: 'border-success/40 bg-paper text-success',
    brand: 'border-brand/40 bg-paper text-brand-deep',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-[var(--r-md)] border px-6 py-12 text-center shadow-card sm:py-16',
        toneClasses[tone],
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full border',
            iconRing[tone]
          )}
        >
          {icon}
        </div>
      )}
      {eyebrow && (
        <div className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-[1.25rem] font-medium leading-[1.25] text-ink sm:text-[1.5rem]">
        {title}
      </h2>
      {description && (
        <p className="max-w-[42ch] text-[0.875rem] leading-[1.55] text-ink-muted">
          {description}
        </p>
      )}
      {actions && <div className="mt-2 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
