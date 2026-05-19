'use client';

import { type ReactNode } from 'react';

/**
 * Canonical "seal stamps onto the page" reveal. Used wherever a state
 * becomes final and the user should feel it — verified cert, approved
 * row, sent confirmation. Tone is institutional, not playful.
 *
 * The animation itself is a CSS keyframe (.seal-stamp in globals.css)
 * so prefers-reduced-motion zeroes it automatically.
 */
export function SealStamp({
  size = 64,
  tone = 'seal',
  className = '',
  children,
}: {
  size?: number;
  tone?: 'seal' | 'success' | 'brand';
  className?: string;
  children?: ReactNode;
}) {
  const ringColor =
    tone === 'success'
      ? 'text-success'
      : tone === 'brand'
      ? 'text-brand'
      : 'text-seal-deep';

  return (
    <span
      className={`seal-stamp relative inline-flex items-center justify-center ${className}`}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={ringColor}
      >
        <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        <circle cx="32" cy="32" r="23" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <circle cx="32" cy="32" r="17" stroke="currentColor" strokeWidth="0.75" opacity="0.25" />
        {!children && (
          <path
            d="M22 33 L29 40 L43 25"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {children && (
        <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      )}
    </span>
  );
}
