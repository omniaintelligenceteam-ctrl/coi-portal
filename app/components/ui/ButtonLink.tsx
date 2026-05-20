import Link from 'next/link';
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'seal';
type Size = 'sm' | 'md' | 'lg';

const base =
  'focus-ring tap-target relative inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-150 ease-out select-none';

const sizes: Record<Size, string> = {
  sm: 'h-9 min-h-9 px-3 text-[0.75rem]',
  md: 'h-11 min-h-11 px-4 text-[0.8125rem]',
  lg: 'h-12 min-h-12 px-5 text-[0.875rem]',
};

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-card hover:bg-brand-deep active:bg-brand-near',
  secondary:
    'border border-hairline-strong bg-card text-ink hover:bg-paper-deep/60 active:bg-paper-deep',
  ghost:
    'bg-transparent text-ink-muted hover:bg-paper-deep/60 hover:text-ink active:bg-paper-deep',
  danger: 'bg-danger text-white shadow-card hover:bg-danger/90 active:bg-danger/95',
  link: 'h-auto min-h-0 px-0 text-brand-deep underline-offset-4 hover:text-brand-near hover:underline',
  seal: 'bg-seal text-white shadow-card hover:bg-seal-deep active:bg-seal-deep',
};

export interface ButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  uppercase?: boolean;
  external?: boolean;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  {
    href,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    uppercase = false,
    external = false,
    className,
    children,
    ...rest
  },
  ref
) {
  const composed = cn(
    base,
    sizes[size],
    variants[variant],
    fullWidth && 'w-full',
    uppercase && 'caps tracking-[0.14em]',
    className
  );
  if (external) {
    return (
      <a
        ref={ref}
        href={href}
        className={composed}
        target={rest.target ?? '_blank'}
        rel={rest.rel ?? 'noopener noreferrer'}
        {...rest}
      >
        {leadingIcon && <span className="inline-flex shrink-0">{leadingIcon}</span>}
        {children && <span className="inline-flex items-center">{children}</span>}
        {trailingIcon && <span className="inline-flex shrink-0">{trailingIcon}</span>}
      </a>
    );
  }
  return (
    <Link ref={ref} href={href} className={composed} {...rest}>
      {leadingIcon && <span className="inline-flex shrink-0">{leadingIcon}</span>}
      {children && <span className="inline-flex items-center">{children}</span>}
      {trailingIcon && <span className="inline-flex shrink-0">{trailingIcon}</span>}
    </Link>
  );
});
