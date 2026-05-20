import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'seal' | 'brand';
type Surface = 'white' | 'paper' | 'sunken';
type Padding = 'none' | 'sm' | 'md' | 'lg';

const surfaces: Record<Surface, string> = {
  white: 'bg-card',
  paper: 'bg-paper',
  sunken: 'bg-paper-deep',
};

const tones: Record<Tone, string> = {
  default: 'border-hairline',
  success: 'border-success/40 bg-success-soft/50',
  warning: 'border-warning/40 bg-warning-soft/40',
  danger: 'border-danger/30 bg-danger-soft/40',
  seal: 'border-seal/35 bg-seal-soft/50',
  brand: 'border-brand/30 bg-brand-soft/50',
};

const paddings: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: Surface;
  tone?: Tone;
  padding?: Padding;
  bordered?: boolean;
  raised?: boolean;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    surface = 'white',
    tone = 'default',
    padding = 'md',
    bordered = true,
    raised = false,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--r-md)]',
        surfaces[surface],
        bordered && 'border',
        tones[tone],
        paddings[padding],
        raised ? 'shadow-lift' : 'shadow-card',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="caps mb-1.5 text-[0.65rem] font-semibold text-ink-muted">
            {eyebrow}
          </div>
        )}
        {title && (
          <h3 className="font-display text-[1.125rem] font-medium leading-[1.25] text-ink">
            {title}
          </h3>
        )}
        {subtitle && (
          <p className="mt-1 text-[0.8125rem] leading-[1.5] text-ink-muted">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
