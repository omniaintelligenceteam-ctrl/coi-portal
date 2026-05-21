'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, Send } from 'lucide-react';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { useRowPulse } from '@/app/components/motion';
import { Button, Banner } from '@/app/components/ui';
import { createClient } from '@/lib/supabase/browser';
import { useQueueShortcuts } from '../useQueueShortcuts';
import { ShortcutHelp } from '../ShortcutHelp';

/**
 * Queue list — Statement Phase 2b.
 *
 * Replaces the prior dense desktop table with a rank-ordered card list.
 * Each card surfaces the four things Brook needs at a glance: client name
 * (display weight), holder, status pill, AI review state. Reviewer-passed
 * items get a Sovereign Blue left-border to flag "ready for one-click
 * approve". Card density is higher than the prior mobile card pattern so
 * 10+ items fit on a desktop screen without scrolling.
 *
 * All interactive behavior preserved verbatim from the prior table view:
 * bulk approve with 8s undo, realtime Supabase subscriptions for INSERT
 * and UPDATE events, keyboard shortcuts (j/k navigation, a approve,
 * shift+a bulk, ? help), focus state with brand-tone outline, row pulse
 * on remote update, staggered first-paint mount.
 */

export type QueueRow = {
  id: string;
  cert_number: string;
  holder_name: string;
  status: CertStatus;
  requested_at: string;
  reviewer_pass: boolean | null;
  reviewer_flags: { severity: 'error' | 'warning' | 'info' }[];
  client: { business_name: string } | null;
};

function flagCounts(flags: QueueRow['reviewer_flags']) {
  let errors = 0;
  let warnings = 0;
  for (const f of flags ?? []) {
    if (f.severity === 'error') errors++;
    else if (f.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type BulkState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; succeeded: number; failed: { id: string; certNumber: string | null; error: string }[] };

const BULK_UNDO_MS = 8000;

export function QueueTable({ rows: initialRows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<QueueRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<BulkState>({ kind: 'idle' });
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newRowIds, setNewRowIds] = useState<Set<string>>(new Set());
  const [updateSig, setUpdateSig] = useState<Map<string, string>>(new Map());
  const [isInitial, setIsInitial] = useState(true);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const t = setTimeout(() => setIsInitial(false), 600);
    return () => clearTimeout(t);
  }, []);

  const eligibleIds = new Set(
    rows.filter((r) => r.status === 'pending' || r.status === 'reviewed').map((r) => r.id),
  );

  const selectedEligible = [...selected].filter((id) => eligibleIds.has(id));

  const toggleRow = useCallback(
    (id: string) => {
      if (!eligibleIds.has(id)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  function toggleAll() {
    if (selectedEligible.length === eligibleIds.size) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  }

  const executeBulkApprove = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBulkState({ kind: 'running' });
      try {
        const res = await fetch('/api/bulk-approve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestIds: ids }),
        });
        const body = (await res.json()) as {
          succeeded: string[];
          failed: { id: string; certNumber: string | null; error: string }[];
        };
        setBulkState({ kind: 'done', succeeded: body.succeeded.length, failed: body.failed });
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        setBulkState({
          kind: 'done',
          succeeded: 0,
          failed: ids.map((id) => ({
            id,
            certNumber: null,
            error: err instanceof Error ? err.message : 'Network error',
          })),
        });
      }
    },
    [router],
  );

  function bulkApprove() {
    const ids = selectedEligible;
    if (ids.length === 0) return;

    pulseRowsOptimistically(ids);

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) executeBulkApprove(ids);
    }, BULK_UNDO_MS);

    const count = ids.length;
    toast.custom(
      (id) => (
        <div className="relative w-80 overflow-hidden rounded-md border border-hairline-strong bg-card shadow-lift">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[0.85rem] text-ink">
              Approved <span className="font-mono font-semibold">{count}</span> cert
              {count === 1 ? '' : 's'}. Sending in 8s.
            </span>
            <button
              type="button"
              onClick={() => {
                cancelled = true;
                clearTimeout(timer);
                toast.dismiss(id);
              }}
              className="focus-ring caps -m-1 rounded p-1 text-[0.62rem] font-semibold text-brand hover:text-brand-deep"
            >
              Undo
            </button>
          </div>
          <div
            aria-hidden="true"
            className="toast-countdown absolute bottom-0 left-0 h-[2px] w-full bg-brand"
            style={{ ['--countdown-duration' as never]: `${BULK_UNDO_MS}ms` }}
          />
        </div>
      ),
      { duration: BULK_UNDO_MS },
    );
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-queue-cert-requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cert_requests' },
        (payload) => {
          const fresh = payload.new as Partial<QueueRow> & {
            id: string;
            status?: CertStatus;
          };
          if (fresh.status !== 'pending' && fresh.status !== 'reviewed') return;
          setRows((prev) => {
            if (prev.some((r) => r.id === fresh.id)) return prev;
            const stub: QueueRow = {
              id: fresh.id,
              cert_number: fresh.cert_number ?? '—',
              holder_name: fresh.holder_name ?? '—',
              status: (fresh.status ?? 'pending') as CertStatus,
              requested_at: fresh.requested_at ?? new Date().toISOString(),
              reviewer_pass: fresh.reviewer_pass ?? null,
              reviewer_flags: fresh.reviewer_flags ?? [],
              client: null,
            };
            return [...prev, stub];
          });
          setNewRowIds((prev) => {
            const next = new Set(prev);
            next.add(fresh.id);
            return next;
          });
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cert_requests' },
        (payload) => {
          const updated = payload.new as Partial<QueueRow> & { id: string; status?: CertStatus };
          setRows((prev) => {
            if (updated.status && updated.status !== 'pending' && updated.status !== 'reviewed') {
              return prev.filter((r) => r.id !== updated.id);
            }
            return prev.map((r) =>
              r.id === updated.id ? { ...r, ...(updated as Partial<QueueRow>) } : r,
            );
          });
          setUpdateSig((prev) => {
            const next = new Map(prev);
            next.set(updated.id, `${Date.now()}`);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    if (rows.length === 0) {
      if (focusIdx !== -1) setFocusIdx(-1);
      return;
    }
    if (focusIdx >= rows.length) setFocusIdx(rows.length - 1);
  }, [rows, focusIdx]);

  async function approveOne(id: string) {
    if (!eligibleIds.has(id)) return;
    pulseRowsOptimistically([id]);
    try {
      await fetch('/api/bulk-approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestIds: [id] }),
      });
      router.refresh();
    } catch {
      // realtime picks up the change
    }
  }

  function pulseRowsOptimistically(ids: string[]) {
    if (ids.length === 0) return;
    setUpdateSig((prev) => {
      const next = new Map(prev);
      const stamp = `optimistic-${Date.now()}`;
      for (const id of ids) next.set(id, `${stamp}-${id}`);
      return next;
    });
  }

  const focused = focusIdx >= 0 && focusIdx < rows.length ? rows[focusIdx] : null;

  useQueueShortcuts({
    onDown: () => setFocusIdx((i) => Math.min(rows.length - 1, i < 0 ? 0 : i + 1)),
    onUp: () => setFocusIdx((i) => Math.max(0, i < 0 ? 0 : i - 1)),
    onOpen: () => {
      if (focused) router.push(`/admin/queue/${focused.id}`);
    },
    onApprove: () => {
      if (focused && eligibleIds.has(focused.id)) approveOne(focused.id);
    },
    onReject: () => {
      if (focused) router.push(`/admin/queue/${focused.id}?action=reject`);
    },
    onToggleSelect: () => {
      if (focused) toggleRow(focused.id);
    },
    onBulkApprove: () => bulkApprove(),
    onToggleHelp: () => setHelpOpen((v) => !v),
    onFocusSearch: () => {
      const el = document.querySelector<HTMLInputElement>(
        'input[type="search"], input[name="search"], input[data-queue-search]',
      );
      if (el) el.focus();
    },
  });

  const allEligibleSelected =
    eligibleIds.size > 0 && selectedEligible.length === eligibleIds.size;

  return (
    <div>
      {/* Bulk action toolbar */}
      {eligibleIds.size > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            uppercase
            onClick={toggleAll}
          >
            {allEligibleSelected ? 'Deselect all' : `Select all (${eligibleIds.size})`}
          </Button>
          {selectedEligible.length > 0 && (
            <Button
              type="button"
              onClick={bulkApprove}
              loading={bulkState.kind === 'running'}
              size="sm"
              leadingIcon={
                bulkState.kind !== 'running' ? (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                ) : null
              }
              className="bg-success hover:bg-success/90 active:bg-success/95 disabled:bg-success/60"
            >
              {bulkState.kind === 'running'
                ? 'Sending…'
                : `Approve & send ${selectedEligible.length}`}
            </Button>
          )}
          {bulkState.kind === 'done' && (
            <span className="text-[0.8125rem] text-ink-muted">
              {bulkState.succeeded > 0 && (
                <span className="font-semibold text-success">{bulkState.succeeded} sent. </span>
              )}
              {bulkState.failed.length > 0 && (
                <span className="font-semibold text-danger">
                  {bulkState.failed.length} failed.
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {bulkState.kind === 'done' && bulkState.failed.length > 0 && (
        <div className="mb-5">
          <Banner tone="danger" title="Failed to send">
            <ul className="space-y-1">
              {bulkState.failed.map((f) => (
                <li key={f.id} className="font-mono text-[0.75rem] text-ink">
                  {f.certNumber ?? f.id.slice(0, 8)} — {f.error}
                </li>
              ))}
            </ul>
          </Banner>
        </div>
      )}

      {/* Unified card list — works at every breakpoint */}
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {rows.map((r, idx) => {
            const counts = flagCounts(r.reviewer_flags ?? []);
            const isEligible = eligibleIds.has(r.id);
            const isSelected = selected.has(r.id);
            const isFocused = idx === focusIdx;
            const isNew = newRowIds.has(r.id);
            const reviewerClean = r.reviewer_pass === true && counts.errors === 0 && counts.warnings === 0;
            return (
              <PulseCard
                key={r.id}
                pulseKey={updateSig.get(r.id)}
                isFirstPaint={isInitial && !isNew}
                isNew={isNew}
                idx={idx}
                reduce={Boolean(reduce)}
                onClick={() => setFocusIdx(idx)}
                className={[
                  'group relative rounded-[var(--r-md)] border bg-card transition-colors',
                  isSelected
                    ? 'border-brand bg-brand-soft/40'
                    : isFocused
                      ? 'border-ink shadow-card'
                      : 'border-hairline hover:border-hairline-strong',
                  // Sovereign Blue left edge when reviewer agent has cleared the request.
                  reviewerClean ? 'shadow-[inset_3px_0_0_0_var(--color-brand)]' : '',
                ].join(' ')}
              >
                <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                  {/* Selection checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!isEligible}
                    onChange={() => toggleRow(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 h-4 w-4 shrink-0 rounded-[3px] border-hairline-strong text-brand disabled:cursor-not-allowed disabled:opacity-30 focus:ring-brand/40"
                    aria-label={`Select ${r.cert_number}`}
                  />

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <h3 className="font-display truncate text-[1.05rem] font-medium leading-[1.25] text-ink sm:text-[1.15rem]">
                          {r.client?.business_name ?? '—'}
                        </h3>
                        <p className="mt-0.5 truncate text-[0.85rem] text-ink-muted">
                          to <span className="text-ink">{r.holder_name}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <StatusPill status={r.status} />
                        <AiReviewIndicator
                          pass={r.reviewer_pass}
                          errors={counts.errors}
                          warnings={counts.warnings}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline pt-3">
                      <div className="flex items-center gap-3 text-[0.78rem] text-ink-faint">
                        <Link
                          href={`/admin/queue/${r.id}`}
                          className="focus-ring num-tabular -m-1 rounded p-1 font-mono text-[0.78rem] font-medium text-ink hover:text-brand-deep"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.cert_number}
                        </Link>
                        <span className="num-tabular font-mono">{relativeTime(r.requested_at)}</span>
                      </div>
                      <Link
                        href={`/admin/queue/${r.id}`}
                        className="focus-ring caps inline-flex items-center gap-1.5 rounded text-[0.62rem] font-semibold tracking-[0.12em] text-brand transition-colors hover:text-brand-deep"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              </PulseCard>
            );
          })}
        </AnimatePresence>
      </ul>

      {/* Keyboard cheat strip — visible on desktop */}
      <div className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-2 px-1 sm:flex">
        <ShortcutHint keys={['j', 'k']} label="Move" />
        <ShortcutHint keys={['Enter']} label="Open" />
        <ShortcutHint keys={['a']} label="Approve" />
        <ShortcutHint keys={['?']} label="More" />
      </div>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

/**
 * Card wrapper with pulse + entry animation. Handles:
 *   - first-paint stagger (so the list reveals in order on mount)
 *   - realtime-update pulse (row-pulse class fires when `pulseKey` changes)
 *   - new-row entry animation (when Supabase INSERT delivers it)
 */
function PulseCard({
  pulseKey,
  isFirstPaint,
  isNew,
  idx,
  reduce,
  className,
  onClick,
  children,
}: {
  pulseKey: unknown;
  isFirstPaint: boolean;
  isNew: boolean;
  idx: number;
  reduce: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRowPulse<HTMLLIElement>(pulseKey);
  return (
    <motion.li
      ref={ref}
      initial={
        reduce
          ? false
          : isNew
            ? { opacity: 0, y: -4 }
            : isFirstPaint
              ? { opacity: 0, y: 6 }
              : false
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.32,
        ease: [0.16, 1, 0.3, 1],
        delay: isFirstPaint && idx < 8 ? idx * 0.04 : 0,
      }}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.li>
  );
}

function ShortcutHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-ink-faint">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-hairline-strong bg-card px-1 font-mono text-[0.65rem] font-medium text-ink-muted"
        >
          {k}
        </kbd>
      ))}
      <span className="caps text-[0.58rem] font-medium tracking-caps">{label}</span>
    </span>
  );
}

function AiReviewIndicator({
  pass,
  errors,
  warnings,
}: {
  pass: boolean | null;
  errors: number;
  warnings: number;
}) {
  if (pass === null) {
    return (
      <span
        className="caps inline-flex items-center gap-1.5 text-[0.65rem] text-ink-faint"
        role="status"
        aria-live="polite"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-muted opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-muted" />
        </span>
        Reviewing
      </span>
    );
  }
  if (pass && errors === 0 && warnings === 0) {
    return (
      <span
        className="caps inline-flex items-center gap-1.5 text-[0.65rem] font-semibold text-brand"
        role="status"
        aria-live="polite"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        Clean
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2 text-[0.75rem]"
      role="status"
      aria-live="polite"
    >
      {errors > 0 && (
        <span className="inline-flex items-center gap-1 font-mono font-medium text-danger">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="inline-flex items-center gap-1 font-mono font-medium text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {warnings}
        </span>
      )}
      {errors === 0 && warnings === 0 && (
        <span className="caps text-[0.65rem] text-ink-faint">No flags</span>
      )}
    </span>
  );
}
