'use client';

import { useFormStatus } from 'react-dom';

type Variant = 'primary' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

// Variant carries only color + hover; size carries padding so the existing
// access-requests buttons keep their pixel-exact shape (Send invite = md,
// Approve & create / Reject = sm).
const VARIANT_CLS: Record<Variant, string> = {
  primary:
    'focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-brand text-sm font-semibold text-white transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60',
  danger:
    'focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-danger/50 bg-white text-sm font-semibold text-danger transition-colors hover:bg-danger-soft/40 disabled:cursor-not-allowed disabled:opacity-60',
  subtle:
    'focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-hairline-strong bg-white text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40 disabled:cursor-not-allowed disabled:opacity-60',
};

const SIZE_CLS: Record<Size, string> = {
  sm: 'px-4 py-2',
  md: 'px-5 py-2.5',
};

export function AdminFormButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}
