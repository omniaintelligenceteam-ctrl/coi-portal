type Size = 'sm' | 'md' | 'lg';
type Position = 'tr' | 'tl' | 'br' | 'bl';

const positions: Record<Position, string> = {
  tr: '-right-8 -top-8 sm:-right-12 sm:-top-12',
  tl: '-left-8 -top-8 sm:-left-12 sm:-top-12',
  br: '-right-8 -bottom-8 sm:-right-12 sm:-bottom-12',
  bl: '-left-8 -bottom-8 sm:-left-12 sm:-bottom-12',
};

const positionsInner: Record<Position, string> = {
  tr: '-right-3 -top-3 sm:-right-5 sm:-top-5',
  tl: '-left-3 -top-3 sm:-left-5 sm:-top-5',
  br: '-right-3 -bottom-3 sm:-right-5 sm:-bottom-5',
  bl: '-left-3 -bottom-3 sm:-left-5 sm:-bottom-5',
};

const sizes: Record<Size, { outer: string; inner: string }> = {
  sm: { outer: 'h-24 w-24 sm:h-32 sm:w-32', inner: 'h-14 w-14 sm:h-16 sm:w-16' },
  md: { outer: 'h-32 w-32 sm:h-44 sm:w-44', inner: 'h-20 w-20 sm:h-24 sm:w-24' },
  lg: { outer: 'h-40 w-40 sm:h-56 sm:w-56', inner: 'h-24 w-24 sm:h-28 sm:w-28' },
};

/**
 * Editorial seal decoration — two concentric gold rings tucked into a corner.
 * The "issued moment" mark: use on the insured identity card, login welcome,
 * cert detail header, the verified-cert surface. Parent must be `relative
 * overflow-hidden`.
 */
export function SealCorner({
  size = 'md',
  position = 'tr',
}: {
  size?: Size;
  position?: Position;
}) {
  const s = sizes[size];
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full border-[3px] border-seal/15 sm:border-[4px] ${positions[position]} ${s.outer}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full border border-seal/20 ${positionsInner[position]} ${s.inner}`}
      />
    </>
  );
}
