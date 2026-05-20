'use client';

import { useEffect } from 'react';

/**
 * Modal containing a blob-URL iframe of a freshly-rendered preview PDF.
 *
 * The blob URL is created/revoked by the parent (DecisionForm) — this component
 * just renders the surface. ESC and overlay-click both dismiss.
 */
export function PdfPreviewModal({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF preview"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-hairline-strong bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-hairline-strong px-5 py-3">
          <p className="caps text-[0.62rem] font-semibold text-ink">PDF preview · not yet saved</p>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md px-2 py-1 text-[0.78rem] font-medium text-ink-muted hover:bg-paper-deep/50 hover:text-ink"
          >
            Close (Esc)
          </button>
        </div>
        <iframe src={url} title="PDF preview" className="block flex-1 w-full bg-white" />
        <div className="flex items-center justify-between border-t border-hairline-strong px-5 py-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring text-[0.78rem] font-semibold text-brand hover:underline"
          >
            Open in new tab
          </a>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[0.78rem] font-semibold text-white hover:bg-ink-muted"
          >
            Back to edit
          </button>
        </div>
      </div>
    </div>
  );
}
