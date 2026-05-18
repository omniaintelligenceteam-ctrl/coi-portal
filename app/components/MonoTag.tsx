/**
 * Small monospace pill for cert numbers, policy numbers, NAIC codes.
 * Ledger-feel — looks like a serial number, not a button.
 */
export function MonoTag({
  children,
  size = 'sm',
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'brand' | 'seal' | 'subtle';
  className?: string;
}) {
  const sizing =
    size === 'lg'
      ? 'px-2.5 py-1 text-sm'
      : size === 'md'
      ? 'px-2 py-0.5 text-xs'
      : 'px-1.5 py-0 text-[0.7rem]';

  const palette =
    tone === 'brand'
      ? 'bg-brand-soft text-brand border-brand/20'
      : tone === 'seal'
      ? 'bg-seal-soft text-seal-deep border-seal/25'
      : tone === 'subtle'
      ? 'bg-paper-deep text-ink-muted border-hairline'
      : 'bg-white text-ink border-hairline-strong';

  return (
    <span
      className={`inline-flex items-center rounded-[3px] border font-mono font-medium leading-relaxed tabular-nums ${sizing} ${palette} ${className}`}
    >
      {children}
    </span>
  );
}
