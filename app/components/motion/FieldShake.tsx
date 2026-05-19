'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Wraps a field so it shakes (horizontal) when `errorKey` changes to a
 * truthy value. Pass the error message (or a counter) as the key —
 * every distinct error triggers a new shake.
 *
 * The shake itself is a CSS keyframe in globals.css (.field-shake), so
 * prefers-reduced-motion zeroes it automatically.
 */
export function FieldShake({
  children,
  errorKey,
  className = '',
}: {
  children: ReactNode;
  errorKey: unknown;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<unknown>(null);

  useEffect(() => {
    if (!errorKey || errorKey === last.current) return;
    last.current = errorKey;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('field-shake');
    void el.offsetWidth;
    el.classList.add('field-shake');
  }, [errorKey]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
