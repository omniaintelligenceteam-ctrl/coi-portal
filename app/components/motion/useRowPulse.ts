'use client';

import { useEffect, useRef } from 'react';

/**
 * Restarts the `row-pulse` CSS animation each time `triggerKey` changes.
 * Returns a ref to attach to the row element.
 *
 * Use case: realtime UPDATE on a queue row. Pass the updated_at (or any
 * stable change-key); the row will flash a brand-tone underline-glow so
 * the admin's eye catches the change.
 *
 * Reduced-motion is handled at the CSS level (globals.css zeroes durations).
 */
export function useRowPulse<T extends HTMLElement>(triggerKey: unknown) {
  const ref = useRef<T>(null);
  const lastKey = useRef<unknown>(triggerKey);

  useEffect(() => {
    if (triggerKey === lastKey.current) return;
    lastKey.current = triggerKey;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('row-pulse');
    void el.offsetWidth;
    el.classList.add('row-pulse');
  }, [triggerKey]);

  return ref;
}
