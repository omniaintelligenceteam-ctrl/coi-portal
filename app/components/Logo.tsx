/**
 * The Policy Place wordmark + chevron mark lockup.
 *
 * The chevron mark is recreated as inline SVG (vector — no asset dependency,
 * scales cleanly, stays crisp on the cream paper texture). The wordmark uses
 * Fraunces (loaded globally) with the brand teal on POLICY and ink on PLACE.
 *
 * `tone="dark"` for use on cream backgrounds; `tone="light"` for dark surfaces.
 * `compact` renders only the chevron mark.
 */
type Tone = 'dark' | 'light';

// The teal used in Brook's actual card wordmark — distinct from the navy
// --color-brand the rest of the UI uses for interactive elements.
const LOGO_TEAL = '#5C8E97';

export function Logo({ tone = 'dark', compact = false }: { tone?: Tone; compact?: boolean }) {
  const markColor = tone === 'dark' ? 'text-ink' : 'text-white';
  const placeColor = tone === 'dark' ? 'text-ink' : 'text-white';
  const subColor = tone === 'dark' ? 'text-ink-faint' : 'text-white/55';

  if (compact) {
    return <PolicyPlaceMark className={`h-9 w-auto ${markColor}`} />;
  }

  return (
    <div className="flex items-center gap-3">
      <PolicyPlaceMark className={`h-10 w-auto shrink-0 ${markColor}`} />
      <div className="flex flex-col leading-none">
        <span className="font-display text-[0.95rem] font-semibold tracking-[0.15em]">
          <span style={{ color: tone === 'dark' ? LOGO_TEAL : '#ffffff' }}>POLICY</span>
          <span className={`ml-1 ${placeColor}`}>PLACE</span>
        </span>
        <span className={`caps mt-1.5 text-[0.6rem] font-medium ${subColor}`}>
          Certificate Portal
        </span>
      </div>
    </div>
  );
}

/**
 * Chevron + oval mark from Brook's business card. Pure vector, currentColor
 * driven so it inherits the surrounding text color (ink on cream, white on
 * dark). The italic "the" inside the oval is inverted via the parent's
 * background paint.
 */
export function PolicyPlaceMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 110"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* Outer chevron — wide rooftop */}
      <path
        d="M 18 62 L 120 14 L 222 62"
        strokeWidth="6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* Inner chevron — narrower, nested */}
      <path
        d="M 50 66 L 120 33 L 190 66"
        strokeWidth="6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* Left hairline + end dot */}
      <line x1="22" y1="90" x2="92" y2="90" strokeWidth="2" />
      <circle cx="20" cy="90" r="2.5" fill="currentColor" stroke="none" />
      {/* Right hairline + end dot */}
      <line x1="148" y1="90" x2="218" y2="90" strokeWidth="2" />
      <circle cx="220" cy="90" r="2.5" fill="currentColor" stroke="none" />
      {/* Center oval with italic "the" */}
      <ellipse cx="120" cy="90" rx="24" ry="11" fill="currentColor" stroke="none" />
      <text
        x="120"
        y="94"
        textAnchor="middle"
        fontSize="13"
        fontStyle="italic"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fill="#fefcf7"
        stroke="none"
      >
        the
      </text>
    </svg>
  );
}

/**
 * Legacy export — preserved so any pre-existing call sites that imported
 * ShieldMark keep compiling. New code should reach for PolicyPlaceMark or
 * the full Logo component instead.
 */
export function ShieldMark({ className }: { className?: string }) {
  return <PolicyPlaceMark className={className} />;
}
