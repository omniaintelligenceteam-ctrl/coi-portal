/**
 * Unified status badge with leading indicator dot.
 * Pulses for `pending`. Supports all cert_requests.status enum values.
 */
export type CertStatus =
  | 'pending'
  | 'reviewed'
  | 'approved'
  | 'edited'
  | 'rejected'
  | 'sent';

const STYLE: Record<CertStatus, { dot: string; pill: string; label: string }> = {
  pending:  { dot: 'bg-warning',  pill: 'bg-warning-soft text-warning border-warning/20',     label: 'Pending review' },
  reviewed: { dot: 'bg-brand',    pill: 'bg-brand-soft text-brand border-brand/20',           label: 'Reviewed' },
  approved: { dot: 'bg-success',  pill: 'bg-success-soft text-success border-success/20',    label: 'Approved' },
  edited:   { dot: 'bg-success',  pill: 'bg-success-soft text-success border-success/20',    label: 'Approved · edited' },
  rejected: { dot: 'bg-danger',   pill: 'bg-danger-soft text-danger border-danger/20',       label: 'Rejected' },
  sent:     { dot: 'bg-seal',     pill: 'bg-seal-soft text-seal-deep border-seal/30',         label: 'Sent' },
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

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${text} font-medium ${s.pill}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === 'pending' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-60 animate-ping`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.dot}`} />
      </span>
      <span className="caps">{label ?? s.label}</span>
    </span>
  );
}
