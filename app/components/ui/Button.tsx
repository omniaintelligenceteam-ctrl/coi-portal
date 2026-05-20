import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'seal';
type Size = 'sm' | 'md' | 'lg';

const base =
  'focus-ring tap-target relative inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 select-none';

const sizes: Record<Size, string> = {
  sm: 'h-9 min-h-9 px-3 text-[0.75rem]',
  md: 'h-11 min-h-11 px-4 text-[0.8125rem]',
  lg: 'h-12 min-h-12 px-5 text-[0.875rem]',
};

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-card hover:bg-brand-deep active:bg-brand-near disabled:bg-brand/60',
  secondary:
    'border border-hairline-strong bg-card text-ink hover:bg-paper-deep/60 active:bg-paper-deep',
  ghost:
    'bg-transparent text-ink-muted hover:bg-paper-deep/60 hover:text-ink active:bg-paper-deep',
  danger:
    'bg-danger text-white shadow-card hover:bg-danger/90 active:bg-danger/95 disabled:bg-danger/60',
  link:
    'h-auto min-h-0 px-0 text-brand-deep underline-offset-4 hover:text-brand-near hover:underline',
  seal:
    'bg-seal text-white shadow-card hover:bg-seal-deep active:bg-seal-deep disabled:bg-seal/60',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  uppercase?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    uppercase = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        sizes[size],
        variants[variant],
        fullWidth && 'w-full',
        uppercase && 'caps tracking-[0.14em]',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon && <span className="inline-flex shrink-0">{leadingIcon}</span>
      )}
      {children && <span className="inline-flex items-center">{children}</span>}
      {!loading && trailingIcon && <span className="inline-flex shrink-0">{trailingIcon}</span>}
    </button>
  );
});
