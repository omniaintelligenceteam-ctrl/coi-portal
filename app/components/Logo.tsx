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
 * dark). Chevrons are filled wedges (constant-thickness rooftop bars) to
 * match the actual card — the previous stroked-line version read too thin.
 */
export function PolicyPlaceMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 260 130"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      {/* Outer chevron — wide filled rooftop wedge */}
      <path d="M 10 76 L 130 12 L 250 76 L 228 76 L 130 30 L 32 76 Z" />
      {/* Inner chevron — narrower filled wedge, nested below the outer */}
      <path d="M 54 82 L 130 38 L 206 82 L 188 82 L 130 52 L 72 82 Z" />
      {/* Left hairline + outer end dot */}
      <line
        x1="14"
        y1="100"
        x2="98"
        y2="100"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="100" r="2.5" />
      {/* Right hairline + outer end dot */}
      <line
        x1="162"
        y1="100"
        x2="246"
        y2="100"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="248" cy="100" r="2.5" />
      {/* Center oval with italic "the" sitting on the hairline */}
      <ellipse cx="130" cy="100" rx="28" ry="12" />
      <text
        x="130"
        y="104.5"
        textAnchor="middle"
        fontSize="15"
        fontStyle="italic"
        fontFamily="var(--font-fraunces), Georgia, serif"
        fill="#fefcf7"
      >
        the
      </text>
      {/* Tiny center dot below the mark — matches the card decoration */}
      <circle cx="130" cy="124" r="1.6" />
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
