import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from './cn';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'seal' | 'neutral';

const toneClasses: Record<Tone, string> = {
  info: 'border-brand/35 bg-brand-soft/60 text-ink',
  success: 'border-success/35 bg-success-soft/60 text-ink',
  warning: 'border-warning/35 bg-warning-soft/60 text-ink',
  danger: 'border-danger/30 bg-danger-soft/60 text-ink',
  seal: 'border-seal/35 bg-seal-soft/60 text-ink',
  neutral: 'border-hairline bg-paper-deep/50 text-ink',
};

const iconColor: Record<Tone, string> = {
  info: 'text-brand-deep',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  seal: 'text-seal-deep',
  neutral: 'text-ink-muted',
};

const defaultIcon: Record<Tone, ReactNode> = {
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  danger: <XCircle className="h-4 w-4" />,
  seal: <CheckCircle2 className="h-4 w-4" />,
  neutral: <Info className="h-4 w-4" />,
};

export function Banner({
  tone = 'neutral',
  title,
  children,
  icon,
  actions,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode | false;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 rounded-[var(--r-md)] border px-4 py-3 shadow-card sm:flex-row sm:items-start',
        toneClasses[tone],
        className
      )}
    >
      {icon !== false && (
        <span className={cn('mt-0.5 inline-flex shrink-0', iconColor[tone])}>
          {icon ?? defaultIcon[tone]}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <div className="text-[0.875rem] font-semibold leading-[1.35] text-ink">{title}</div>
        )}
        {children && (
          <div className={cn('text-[0.8125rem] leading-[1.5] text-ink-muted', title && 'mt-1')}>
            {children}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">{actions}</div>}
    </div>
  );
}
