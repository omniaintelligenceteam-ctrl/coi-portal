/**
 * Numbered section label: `01 · Select coverages`.
 * Used to mark form steps and admin sections in editorial style.
 */
export function SectionLabel({
  number,
  children,
  state = 'active',
}: {
  number: number;
  children: React.ReactNode;
  state?: 'active' | 'done' | 'pending';
}) {
  const n = String(number).padStart(2, '0');

  const numberColor =
    state === 'done' ? 'text-seal' : state === 'pending' ? 'text-ink-faint' : 'text-brand';
  const labelColor =
    state === 'pending' ? 'text-ink-faint' : 'text-ink';

  return (
    <div className="flex items-baseline gap-3">
      <span className={`font-mono text-[0.78rem] font-medium tabular-nums ${numberColor}`}>
        {n}
      </span>
      <span className={`caps text-[0.72rem] font-semibold ${labelColor}`}>{children}</span>
    </div>
  );
}
