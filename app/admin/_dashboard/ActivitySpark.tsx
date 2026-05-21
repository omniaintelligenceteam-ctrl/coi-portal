/**
 * 30-day activity sparkline — pure SVG, no JS dep, server-renderable.
 *
 * Takes an array of daily counts (oldest first, length 30) and renders a
 * smoothed area chart in Sovereign Blue. The total is shown right-aligned
 * underneath; the date axis only labels the start.
 */
export function ActivitySpark({ daily }: { daily: number[] }) {
  const N = daily.length;
  const max = Math.max(1, ...daily);
  const W = 300;
  const H = 64;

  // Map each daily count to (x, y). Top of viewport is high count.
  const points = daily.map((v, i) => {
    const x = (i / Math.max(1, N - 1)) * W;
    const y = H - (v / max) * (H - 8) - 4;
    return [x, y] as const;
  });

  // Polyline path: M x0,y0 L x1,y1 ...
  const path =
    'M' + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
  const area = path + ` L${W},${H} L0,${H} Z`;

  const total = daily.reduce((s, v) => s + v, 0);

  const startDate = new Date(Date.now() - (N - 1) * 86_400_000);
  const startLabel = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-16 w-full">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-soft)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--color-brand-soft)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" />
        <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="1.5" />
      </svg>
      <div className="mt-2 flex items-baseline justify-between text-[0.78rem]">
        <span className="font-mono text-ink-faint">{startLabel}</span>
        <span className="text-ink-muted">
          <span className="num-tabular font-medium text-ink">{total}</span> certs sent
        </span>
      </div>
    </div>
  );
}
