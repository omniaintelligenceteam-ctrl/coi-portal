'use client';

import { useState, type ReactNode } from 'react';

/**
 * Click to copy `text` to clipboard. Briefly shows a small "Copied" pill
 * that floats up from the button. Falls back silently on clipboard errors
 * (e.g., insecure context / older browsers).
 *
 * Animation lives in globals.css (.copy-pill) so it's reduced-motion safe.
 */
export function CopyButton({
  text,
  children,
  className = '',
  pillLabel = 'Copied',
  title,
}: {
  text: string;
  children: ReactNode;
  className?: string;
  pillLabel?: string;
  title?: string;
}) {
  const [tick, setTick] = useState(0);

  const onClick = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setTick((t) => t + 1);
    } catch {
      // fail silent — copy is a nice-to-have, never block the UI
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center ${className}`}
      title={title ?? 'Copy'}
    >
      {children}
      {tick > 0 && (
        <span
          key={tick}
          aria-live="polite"
          className="copy-pill pointer-events-none absolute left-1/2 -top-1 -translate-x-1/2 -translate-y-full rounded-full bg-ink px-2 py-0.5 text-[0.6rem] tracking-[0.18em] uppercase text-paper shadow-card"
        >
          {pillLabel}
        </span>
      )}
    </button>
  );
}
