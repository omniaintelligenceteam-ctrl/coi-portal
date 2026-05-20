import type { ReactNode } from 'react';
import { cn } from './cn';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="caps mb-2 inline-flex items-center gap-2 text-[0.65rem] font-semibold tracking-[0.18em] text-seal-deep">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[1.75rem] font-medium leading-[1.1] text-ink sm:text-[2.125rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-[44ch] text-[0.9375rem] leading-[1.55] text-ink-muted sm:text-[0.9375rem]">
            {subtitle}
          </p>
        )}
        {meta && <div className="mt-3 text-[0.8125rem] text-ink-muted">{meta}</div>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
