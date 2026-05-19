'use client';

import { useState } from 'react';

/**
 * Iframe + paper-textured placeholder. The iframe loads invisibly behind
 * a breathing seal-glyph card; on `onLoad` it crossfades in. Removes the
 * ~500ms of "blank white box" that plain iframes show.
 *
 * Reduced-motion respect comes from globals.css zeroing the .pdf-shimmer
 * animation. The crossfade itself is a 300ms opacity transition.
 */
export function PdfPreview({
  src,
  title,
  className = '',
}: {
  src: string;
  title: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative ${className}`}>
      {!loaded && (
        <div
          aria-hidden="true"
          className="pdf-shimmer absolute inset-0 z-0 flex items-center justify-center bg-paper-deep"
        >
          <PaperSeal />
        </div>
      )}
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className={`relative z-10 block h-[65vh] min-h-[420px] w-full transition-opacity duration-300 sm:h-[820px] ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

function PaperSeal() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      className="text-seal/60"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path
        d="M18 24l5 5 8-10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
}
