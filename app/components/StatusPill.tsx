'use client';

import { useEffect, useRef } from 'react';

/**
 * Unified status badge with leading indicator dot.
 * Pulses for `pending`. Supports all cert_requests.status enum values.
 *
 * When `status` changes (e.g. pending → reviewed → approved), the dot
 * does a one-shot pill-ping (scale 1.25 then back) so the lifecycle
 * transition is felt, not just rendered.
 */
export type CertStatus =
  | 'pending'
  | 'reviewed'
  | 'approved'
  | 'edited'
  | 'rejected'
  | 'sent'
  | 'voided';

const STYLE: Record<CertStatus, { dot: string; pill: string; label: string }> = {
  pending:  { dot: 'bg-warning',  pill: 'bg-warning-soft text-warning border-warning/20',     label: 'Pending review' },
  reviewed: { dot: 'bg-brand',    pill: 'bg-brand-soft text-brand border-brand/20',           label: 'Reviewed' },
  approved: { dot: 'bg-success',  pill: 'bg-success-soft text-success border-success/20',    label: 'Approved' },
  edited:   { dot: 'bg-success',  pill: 'bg-success-soft text-success border-success/20',    label: 'Approved · edited' },
  rejected: { dot: 'bg-danger',   pill: 'bg-danger-soft text-danger border-danger/20',       label: 'Rejected' },
  sent:     { dot: 'bg-seal',     pill: 'bg-seal-soft text-seal-deep border-seal/30',         label: 'Sent' },
  voided:   { dot: 'bg-danger',   pill: 'bg-danger-soft text-danger border-danger/30',        label: 'Voided' },
};

export function StatusPill({
  status,
  size = 'sm',
  label,
}: {
  status: CertStatus;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const s = STYLE[status];
  const padding = size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5';
  const text = size === 'md' ? 'text-xs' : 'text-[0.68rem]';

  // Re-fire the dot ping every time `status` changes — but not on first mount,
  // so server-hydration doesn't waste a flash on data the user already sees.
  const dotRef = useRef<HTMLSpanElement>(null);
  const lastStatus = useRef<CertStatus>(status);
  useEffect(() => {
    if (lastStatus.current === status) return;
    lastStatus.current = status;
    const el = dotRef.current;
    if (!el) return;
    el.classList.remove('pill-ping');
    void el.offsetWidth;
    el.classList.add('pill-ping');
  }, [status]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border transition-colors ${padding} ${text} font-medium ${s.pill}`}
      aria-live="polite"
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === 'pending' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-60 animate-ping`} />
        )}
        <span
          ref={dotRef}
          className={`relative inline-flex h-1.5 w-1.5 rounded-full transition-colors ${s.dot}`}
        />
      </span>
      <span className="caps">{label ?? s.label}</span>
    </span>
  );
}
