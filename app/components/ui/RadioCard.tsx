'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Radio choice rendered as a real card with icon + title + description.
 *
 * Used for high-stakes decisions like Approve / Edit / Reject where flat
 * segmented controls read as buttons rather than discrete choices.
 *
 *   <RadioCard
 *     name="decision"
 *     value="approve"
 *     selected={mode === 'approve'}
 *     onSelect={() => setMode('approve')}
 *     icon={<Check />}
 *     title="Approve"
 *     description="Send as-is"
 *   />
 *
 * Tone drives the selected-state accent. `default` uses brand blue, `success`
 * uses forest green, `danger` uses coral, etc.
 */
type Tone = 'default' | 'success' | 'warning' | 'danger' | 'seal';

const toneSelected: Record<Tone, string> = {
  default: 'border-brand bg-brand-soft/60 ring-2 ring-brand/30',
  success: 'border-success bg-success-soft/60 ring-2 ring-success/30',
  warning: 'border-warning bg-warning-soft/60 ring-2 ring-warning/30',
  danger: 'border-danger bg-danger-soft/60 ring-2 ring-danger/30',
  seal: 'border-seal bg-seal-soft/60 ring-2 ring-seal/30',
};

const toneAccent: Record<Tone, string> = {
  default: 'text-brand-deep',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  seal: 'text-seal-deep',
};

const toneIconBg: Record<Tone, string> = {
  default: 'bg-brand text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  seal: 'bg-seal text-white',
};

export function RadioCard({
  name,
  value,
  selected,
  onSelect,
  icon,
  title,
  description,
  tone = 'default',
  disabled = false,
  className,
}: {
  name: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  tone?: Tone;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        // Mobile: row layout (icon left, content right) — keeps each card short.
        // Desktop (sm+): column layout (icon on top) — richer for hero choices.
        'group relative flex cursor-pointer flex-row items-center gap-3.5 rounded-[var(--r-md)] border bg-card p-4 transition-all duration-150 ease-out sm:flex-col sm:items-start sm:gap-3 sm:p-5',
        selected
          ? toneSelected[tone]
          : 'border-hairline-strong shadow-card hover:border-ink/30 hover:bg-paper-deep/30',
        disabled && 'cursor-not-allowed opacity-55',
        className
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={() => !disabled && onSelect()}
        disabled={disabled}
        className="sr-only"
        aria-label={typeof title === 'string' ? title : value}
      />
      {icon && (
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
            selected
              ? toneIconBg[tone]
              : 'border border-hairline-strong bg-paper-deep text-ink-muted group-hover:border-ink/30 group-hover:text-ink'
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'font-display text-[1rem] font-medium leading-[1.2] tracking-tight',
            selected ? toneAccent[tone] : 'text-ink'
          )}
        >
          {title}
        </p>
        {description && (
          <p className="mt-1 text-[0.8125rem] leading-[1.5] text-ink-muted">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}
