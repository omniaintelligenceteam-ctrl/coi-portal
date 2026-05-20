'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';

export function MobileSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'auto',
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'full';
  ariaLabel?: string;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the sheet for screen readers
    requestAnimationFrame(() => sheetRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" aria-modal="true" role="dialog" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="sheet-scrim fade-scrim absolute inset-0 cursor-default"
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={cn(
          'bottom-sheet slide-up relative z-10 flex flex-col outline-none',
          size === 'full' ? 'h-[92dvh]' : ''
        )}
      >
        <span aria-hidden="true" className="bottom-sheet-handle" />
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 pb-4 pt-2 sm:px-6">
            <div className="min-w-0">
              {title && (
                <h2 className="font-display text-[1.1rem] font-medium leading-[1.25] text-ink">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-1 text-[0.8125rem] text-ink-muted">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring -mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-paper-deep/60 hover:text-ink"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
        {footer && (
          <div className="border-t border-hairline bg-paper/70 px-5 py-3 sm:px-6">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
