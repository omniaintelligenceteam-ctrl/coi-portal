/**
 * The Policy Place wordmark lockup — "POLICY PLACE" with the "Certificate
 * Portal" subtitle. The chevron/roof mark was removed; this is wordmark only.
 *
 * `tone="dark"` for use on cream backgrounds; `tone="light"` for dark surfaces.
 * `compact` drops the subtitle for tight spaces.
 */
type Tone = 'dark' | 'light';

// The teal used in Brook's actual card wordmark — distinct from the navy
// --color-brand the rest of the UI uses for interactive elements.
const LOGO_TEAL = '#5C8E97';

export function Logo({ tone = 'dark', compact = false }: { tone?: Tone; compact?: boolean }) {
  const placeColor = tone === 'dark' ? 'text-ink' : 'text-white';
  const subColor = tone === 'dark' ? 'text-ink-faint' : 'text-white/55';

  return (
    <div className="flex flex-col leading-none">
      <span className="font-display text-[0.95rem] font-semibold tracking-[0.15em]">
        <span style={{ color: tone === 'dark' ? LOGO_TEAL : '#ffffff' }}>POLICY</span>
        <span className={`ml-1 ${placeColor}`}>PLACE</span>
      </span>
      {!compact && (
        <span className={`caps mt-1.5 text-[0.6rem] font-medium ${subColor}`}>
          Certificate Portal
        </span>
      )}
    </div>
  );
}
