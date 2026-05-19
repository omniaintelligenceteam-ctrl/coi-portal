import type { CertStatus } from '@/app/components/StatusPill';

/**
 * Lifecycle Timeline — editorial vertical stepper for the result page.
 *
 * Steps:
 *   1. Requested      — cert.requested_at, actor = requested_by_email
 *   2. AI Reviewed    — cert.reviewed_at + reviewer_pass (pass / warnings / errors)
 *   3. Admin Approved — cert.decided_at, actor = decided_by_email
 *   4. Sent to Holder — cert.sent_at, recipient = holder.name
 *   5. Holder Opened  — pending placeholder until verify-click telemetry lands
 *
 * Gracefully degrades when any field is null — empty hairline circle, "Pending" pill.
 */

type Severity = 'low' | 'medium' | 'high' | string;

export type LifecycleProps = {
  status: CertStatus;
  requestedAt: string;
  requestedByEmail: string | null;
  reviewedAt: string | null;
  reviewerPass: boolean | null;
  reviewerFlags: Array<{ severity?: Severity }> | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  sentAt: string | null;
  holderName: string;
  holderOpenedAt: string | null;
};

type StepState = 'done' | 'current' | 'pending' | 'skipped';

type StepRow = {
  key: string;
  label: string;
  state: StepState;
  timestamp: string | null;
  meta: React.ReactNode | null;
  pill?: { tone: 'success' | 'warning' | 'danger' | 'muted'; text: string };
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function reviewerSummary(
  pass: boolean | null,
  flags: Array<{ severity?: Severity }> | null,
): StepRow['pill'] | undefined {
  if (pass === null) return undefined;
  const list = flags ?? [];
  const hasHigh = list.some((f) => f.severity === 'high');
  if (!pass || hasHigh) {
    return { tone: 'danger', text: `${list.length} ${list.length === 1 ? 'error' : 'errors'}` };
  }
  if (list.length > 0) {
    return {
      tone: 'warning',
      text: `${list.length} ${list.length === 1 ? 'warning' : 'warnings'}`,
    };
  }
  return { tone: 'success', text: 'Clean pass' };
}

export function LifecycleTimeline({
  status,
  requestedAt,
  requestedByEmail,
  reviewedAt,
  reviewerPass,
  reviewerFlags,
  decidedAt,
  decidedByEmail,
  sentAt,
  holderName,
  holderOpenedAt,
}: LifecycleProps) {
  const isRejected = status === 'rejected';
  const isSent = status === 'sent';

  // Build rows with derived state. "Current" = the next step pending after the
  // last completed one (only when the cert is still in flight).
  const requestedRow: StepRow = {
    key: 'requested',
    label: 'Requested',
    state: 'done',
    timestamp: requestedAt,
    meta: requestedByEmail ? (
      <span className="font-mono text-[0.72rem] text-ink-muted">{requestedByEmail}</span>
    ) : (
      <span className="caps text-[0.6rem] text-ink-faint">Customer</span>
    ),
  };

  const reviewedRow: StepRow = {
    key: 'reviewed',
    label: 'AI Reviewed',
    state: reviewedAt ? 'done' : 'pending',
    timestamp: reviewedAt,
    meta: null,
    pill: reviewerSummary(reviewerPass, reviewerFlags),
  };

  const approvedRow: StepRow = {
    key: 'approved',
    label: isRejected ? 'Admin Decision' : 'Admin Approved',
    state: decidedAt ? (isRejected ? 'done' : 'done') : 'pending',
    timestamp: decidedAt,
    meta: decidedByEmail ? (
      <span className="font-mono text-[0.72rem] text-ink-muted">{decidedByEmail}</span>
    ) : null,
    pill: isRejected
      ? { tone: 'danger', text: 'Rejected' }
      : status === 'edited'
      ? { tone: 'warning', text: 'Edited' }
      : undefined,
  };

  const sentRow: StepRow = {
    key: 'sent',
    label: 'Sent to Holder',
    state: sentAt ? 'done' : isRejected ? 'skipped' : 'pending',
    timestamp: sentAt,
    meta: sentAt ? (
      <span className="text-[0.72rem] text-ink-muted">
        to <span className="text-ink">{holderName}</span>
      </span>
    ) : null,
  };

  const openedRow: StepRow = {
    key: 'opened',
    label: 'Holder Opened',
    state: holderOpenedAt ? 'done' : isRejected ? 'skipped' : 'pending',
    timestamp: holderOpenedAt,
    meta: holderOpenedAt ? null : (
      <span className="caps text-[0.6rem] font-medium text-ink-faint">Not yet opened</span>
    ),
    pill:
      !holderOpenedAt && !isRejected
        ? { tone: 'muted', text: 'Pending' }
        : undefined,
  };

  const rows: StepRow[] = [requestedRow, reviewedRow, approvedRow, sentRow, openedRow];

  // Mark the first pending step as "current" if the cert is still in flight,
  // for a subtle highlight that replaces the old in-flight stepper.
  if (!isSent && !isRejected) {
    const firstPending = rows.find((r) => r.state === 'pending');
    if (firstPending) firstPending.state = 'current';
  }

  return (
    <section aria-label="Lifecycle timeline" className="mt-10">
      <p className="caps text-[0.62rem] font-semibold text-ink-faint">Lifecycle</p>
      <ol className="relative mt-5">
        {rows.map((row, i) => (
          <TimelineRow key={row.key} row={row} idx={i} isLast={i === rows.length - 1} />
        ))}
      </ol>
    </section>
  );
}

function TimelineRow({
  row,
  idx,
  isLast,
}: {
  row: StepRow;
  idx: number;
  isLast: boolean;
}) {
  // Tier 1 #10 — top-to-bottom reveal. The connector "draws" downward and
  // the dot pops on as the imaginary line passes it. 120ms cascade per row
  // matches the 600ms total feel without going long. Reduced-motion zeroes
  // the keyframes globally (globals.css).
  const connectorDelay = `${idx * 120}ms`;
  const dotDelay = `${idx * 120 + 60}ms`;
  return (
    <li className="relative grid grid-cols-[1.25rem,minmax(0,1fr)] gap-x-4 pb-6 last:pb-0">
      {/* Connector hairline */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="timeline-draw absolute left-[0.5625rem] top-4 bottom-0 w-px bg-hairline"
          style={{ animationDelay: connectorDelay }}
        />
      )}

      {/* Dot */}
      <span
        className="timeline-dot-pop relative z-10 mt-1 flex h-[1.125rem] w-[1.125rem] items-center justify-center"
        style={{ animationDelay: dotDelay }}
      >
        <Dot state={row.state} />
      </span>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`font-display text-[0.95rem] font-semibold tracking-tight ${
              row.state === 'pending' || row.state === 'skipped'
                ? 'text-ink-faint'
                : 'text-ink'
            }`}
          >
            {row.label}
          </span>
          {row.pill && <Pill tone={row.pill.tone}>{row.pill.text}</Pill>}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {row.timestamp ? (
            <span className="font-mono text-[0.72rem] tabular-nums text-ink-muted">
              {formatDateTime(row.timestamp)}
            </span>
          ) : (
            <span className="caps text-[0.6rem] font-medium text-ink-faint">—</span>
          )}
          {row.meta}
        </div>
      </div>
    </li>
  );
}

function Dot({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span
        aria-hidden="true"
        className="h-[0.875rem] w-[0.875rem] rounded-full bg-seal shadow-[0_0_0_3px_var(--color-paper)]"
      />
    );
  }
  if (state === 'current') {
    return (
      <span
        aria-hidden="true"
        className="relative h-[0.875rem] w-[0.875rem] rounded-full border border-seal bg-seal-soft shadow-[0_0_0_3px_var(--color-paper)]"
      >
        <span className="absolute inset-[3px] rounded-full bg-seal" />
      </span>
    );
  }
  // pending / skipped
  return (
    <span
      aria-hidden="true"
      className="h-[0.875rem] w-[0.875rem] rounded-full border border-hairline-strong bg-paper shadow-[0_0_0_3px_var(--color-paper)]"
    />
  );
}

function Pill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'muted';
  children: React.ReactNode;
}) {
  const classes =
    tone === 'success'
      ? 'border-success/30 bg-success-soft text-success'
      : tone === 'warning'
      ? 'border-warning/30 bg-warning-soft text-warning'
      : tone === 'danger'
      ? 'border-danger/30 bg-danger-soft text-danger'
      : 'border-hairline-strong bg-paper-deep text-ink-muted';
  return (
    <span
      className={`caps inline-flex items-center rounded-full border px-2 py-[0.125rem] text-[0.55rem] font-semibold ${classes}`}
    >
      {children}
    </span>
  );
}
