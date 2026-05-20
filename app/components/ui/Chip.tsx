import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'default' | 'brand' | 'seal' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, { active: string; inactive: string }> = {
  default: {
    active: 'border-ink bg-ink text-paper',
    inactive: 'border-hairline-strong bg-card text-ink-muted hover:border-ink/40 hover:text-ink',
  },
  brand: {
    active: 'border-brand bg-brand text-white',
    inactive: 'border-brand/30 bg-card text-brand-deep hover:border-brand/60 hover:bg-brand-soft',
  },
  seal: {
    active: 'border-seal bg-seal text-white',
    inactive: 'border-seal/35 bg-card text-seal-deep hover:bg-seal-soft',
  },
  success: {
    active: 'border-success bg-success text-white',
    inactive: 'border-success/35 bg-card text-success hover:bg-success-soft',
  },
  warning: {
    active: 'border-warning bg-warning text-white',
    inactive: 'border-warning/35 bg-card text-warning hover:bg-warning-soft',
  },
  danger: {
    active: 'border-danger bg-danger text-white',
    inactive: 'border-danger/30 bg-card text-danger hover:bg-danger-soft',
  },
};

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: Tone;
  count?: number;
  leadingIcon?: ReactNode;
}

export function Chip({
  active = false,
  tone = 'default',
  count,
  leadingIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'focus-ring caps inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold tracking-[0.12em] transition-all duration-150',
        active ? tones[tone].active : tones[tone].inactive,
        className
      )}
      {...rest}
    >
      {leadingIcon && <span className="inline-flex shrink-0">{leadingIcon}</span>}
      <span>{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'num-tabular ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[0.65rem] font-semibold',
            active ? 'bg-white/20 text-white' : 'bg-ink/5 text-ink-muted'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function StaticChip({
  tone = 'default',
  leadingIcon,
  className,
  children,
}: {
  tone?: Tone;
  leadingIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'caps inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold tracking-[0.12em]',
        tones[tone].inactive.split(' hover:')[0],
        className
      )}
    >
      {leadingIcon && <span className="inline-flex shrink-0">{leadingIcon}</span>}
      {children}
    </span>
  );
}
