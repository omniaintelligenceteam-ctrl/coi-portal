/**
 * 1px hairline rule. Used as the primary division pattern (replaces shadows).
 *
 * <Hairline />                        — plain rule
 * <Hairline label="Coverages" />      — caps label sitting on the rule
 */
export function Hairline({
  label,
  className = '',
  tone = 'warm',
}: {
  label?: string;
  className?: string;
  tone?: 'warm' | 'cool';
}) {
  const lineColor = tone === 'warm' ? 'bg-hairline' : 'bg-hairline-cool';

  if (!label) {
    return <div aria-hidden="true" className={`h-px w-full ${lineColor} ${className}`} />;
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span className="caps shrink-0 text-[0.65rem] font-medium text-ink-faint">{label}</span>
      <div aria-hidden="true" className={`h-px flex-1 ${lineColor}`} />
    </div>
  );
}
