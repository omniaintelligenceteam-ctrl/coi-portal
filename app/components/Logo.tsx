/**
 * The Policy Place wordmark + shield lockup.
 * `tone="dark"` for use on cream backgrounds; `tone="light"` for dark surfaces.
 */
type Tone = 'dark' | 'light';

export function Logo({ tone = 'dark', compact = false }: { tone?: Tone; compact?: boolean }) {
  const text = tone === 'dark' ? 'text-ink' : 'text-white';
  const shieldBg = tone === 'dark' ? 'bg-brand' : 'bg-white/10';
  const shieldText = tone === 'dark' ? 'text-white' : 'text-white';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${shieldBg} shadow-[inset_0_-1px_0_rgba(255,255,255,0.12)]`}
      >
        <ShieldMark className={`h-4 w-4 ${shieldText}`} />
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className={`font-display text-[1.05rem] font-semibold tracking-tight ${text}`}>
            The Policy Place
          </span>
          <span
            className={`caps mt-1 text-[0.62rem] font-medium ${
              tone === 'dark' ? 'text-ink-faint' : 'text-white/55'
            }`}
          >
            Certificate Portal
          </span>
        </div>
      )}
    </div>
  );
}

export function ShieldMark({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  );
}
