'use client';

import { useState } from 'react';
import { Download, Eye, ExternalLink } from 'lucide-react';
import { ButtonLink, IconButton, MobileSheet } from '@/app/components/ui';

/**
 * PDF preview surface for the admin cert detail page.
 *
 * - `variant="desktop"` — inline iframe with hairline border, "Open in tab"
 *   and "Download" actions in a header above the document. Used in the sticky
 *   right column on xl+ viewports.
 * - `variant="mobile"` — a tappable card that opens the iframe inside a
 *   full-height MobileSheet. Mobile users get a real preview without the
 *   iframe shrinking the document into illegibility.
 */
export function PdfPreviewPanel({
  previewUrl,
  downloadUrl,
  certNumber,
  variant,
}: {
  previewUrl: string;
  downloadUrl: string;
  certNumber: string;
  variant: 'desktop' | 'mobile';
}) {
  const [open, setOpen] = useState(false);

  if (variant === 'mobile') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring group flex w-full items-center gap-4 rounded-[var(--r-md)] border border-hairline bg-card px-4 py-4 text-left shadow-card transition-colors hover:border-brand/40 hover:bg-paper-deep/30"
        >
          <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-sm border border-hairline-strong bg-paper-deep">
            <Eye className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="caps block text-[0.62rem] font-semibold tracking-[0.18em] text-seal-deep">
              PDF preview
            </span>
            <span className="num-tabular mt-1 block font-mono text-[0.85rem] font-medium text-ink">
              {certNumber}
            </span>
            <span className="mt-0.5 block text-[0.75rem] text-ink-muted">
              Tap to view full document
            </span>
          </span>
          <span className="caps shrink-0 text-[0.6rem] font-semibold tracking-[0.18em] text-brand-deep group-hover:text-brand-near">
            View
          </span>
        </button>

        <MobileSheet
          open={open}
          onClose={() => setOpen(false)}
          size="full"
          ariaLabel="Certificate preview"
          title={
            <span className="num-tabular font-mono text-[1rem] font-medium text-ink">
              {certNumber}
            </span>
          }
          subtitle="Certificate preview"
          footer={
            <div className="flex items-center gap-2">
              <ButtonLink
                href={downloadUrl}
                external
                variant="secondary"
                size="sm"
                fullWidth
                leadingIcon={<Download className="h-4 w-4" aria-hidden="true" />}
              >
                Download
              </ButtonLink>
              <ButtonLink
                href={previewUrl}
                external
                size="sm"
                fullWidth
                leadingIcon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}
              >
                Open in tab
              </ButtonLink>
            </div>
          }
        >
          <div className="-mx-5 -my-5 h-full sm:-mx-6 sm:-my-6">
            <iframe
              src={previewUrl}
              title={`Certificate ${certNumber} preview`}
              className="block h-full min-h-[65dvh] w-full bg-paper-deep"
            />
          </div>
        </MobileSheet>
      </>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-[var(--r-md)] border border-hairline bg-card shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
          <span className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
            Document
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              label="Open in new tab"
              size="sm"
              variant="ghost"
              onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Download"
              size="sm"
              variant="ghost"
              onClick={() => window.open(downloadUrl, '_self')}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
        </div>
        <iframe
          src={previewUrl}
          title={`Certificate ${certNumber} preview`}
          className="block min-h-[400px] w-full bg-paper-deep xl:h-[760px]"
        />
      </div>
      <p className="caps mt-3 text-[0.58rem] font-medium tracking-[0.18em] text-ink-faint">
        Holder + signature reflect the current row · re-rendered on send
      </p>
    </div>
  );
}

// Backwards-compat: re-export the old modal so DecisionForm's preview-before-save
// keeps working. The two components are unrelated despite the shared filename.
export { PdfPreviewModal } from './PdfPreviewModal';
