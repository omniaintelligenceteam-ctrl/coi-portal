import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'ghost' | 'secondary' | 'primary' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const sizes: Record<Size, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
};

const variants: Record<Variant, string> = {
  ghost: 'text-ink-muted hover:bg-paper-deep/60 hover:text-ink',
  secondary:
    'border border-hairline-strong bg-card text-ink hover:bg-paper-deep/60',
  primary: 'bg-brand text-white shadow-card hover:bg-brand-deep',
  danger: 'text-danger hover:bg-danger-soft',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, children, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'focus-ring inline-flex items-center justify-center rounded-md transition-colors duration-150',
        sizes[size],
        variants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
