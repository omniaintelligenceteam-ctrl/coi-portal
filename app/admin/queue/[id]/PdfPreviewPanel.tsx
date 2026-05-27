'use client';

import { useState } from 'react';
import { Download, ExternalLink, Maximize2 } from 'lucide-react';
import { ButtonLink, IconButton, MobileSheet } from '@/app/components/ui';

/**
 * PDF preview surface for the admin cert detail page.
 *
 * - `variant="desktop"` — inline iframe with hairline border, "Open in tab"
 *   and "Download" actions in a header above the document. Used in the sticky
 *   right column on xl+ viewports.
 * - `variant="mobile"` — same Card frame, but the iframe sits at h-[55vh] and
 *   an expand button opens a full-height MobileSheet for serious reading.
 *   No more tiny eye-icon teaser — the PDF is the visual anchor of the page.
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
        <div className="overflow-hidden rounded-[var(--r-md)] border border-hairline bg-card shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
            <span className="num-tabular font-mono text-[0.78rem] font-medium text-ink">
              {certNumber}
            </span>
            <div className="flex items-center gap-1">
              <IconButton
                label="Download"
                size="sm"
                variant="ghost"
                onClick={() => window.open(downloadUrl, '_self')}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Expand to fullscreen"
                size="sm"
                variant="ghost"
                onClick={() => setOpen(true)}
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <iframe
            src={previewUrl}
            title={`Certificate ${certNumber} preview`}
            className="block h-[55vh] min-h-[420px] w-full bg-paper-deep"
          />
        </div>

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
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
          <span className="num-tabular font-mono text-[0.78rem] font-medium text-ink">
            {certNumber}
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
          className="block min-h-[480px] w-full bg-paper-deep xl:h-[780px]"
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
